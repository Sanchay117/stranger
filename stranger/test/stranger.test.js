// Runs Stranger end to end against a stand-in Kane (fake-kane.js), so no Kane credits are spent.
// Usage: npm test   (needs git and zip on PATH)
import { test, before, after } from 'node:test'
import { createServer } from 'node:http'
import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readPolicies } from '../src/policies.js'

const here = fileURLToPath(new URL('.', import.meta.url))
const repo = join(here, '..', '..')
const BIN = join(here, '..', 'bin', 'stranger.js')
const HOOK = join(here, '..', 'hooks', 'claude-stop.js')
const FAKE = join(here, 'fake-kane.js')
const PASSWORD = 'not-a-real-password-7731'

const LEAKY = readFileSync(join(repo, 'supabase', 'migrations', '0001_invoices.sql'), 'utf8')
const FIXED = `drop policy if exists "Enable read access for all users" on public.invoices;
create policy "Users can read their own invoices"
  on public.invoices for select to authenticated
  using ((select auth.uid()) = user_id);`

// A throwaway project with a config, two accounts and the Duebook migrations.
function project({ probes, migrations = [['0001_invoices.sql', LEAKY]] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'stranger-test-'))
  mkdirSync(join(root, 'migrations'))
  for (const [name, sql] of migrations) writeFileSync(join(root, 'migrations', name), sql)
  const config = {
    url: 'http://localhost:5231/duebook/',
    owner: { email: 'maya@duebook.demo', password: PASSWORD },
    stranger: { email: 'stranger@duebook.demo', password: PASSWORD },
    plant: 'click New invoice and type the text into the Note field',
    look: 'the Your invoices list',
    database: 'supabase',
    migrations: 'migrations',
    watch: ['migrations'],
    ...(probes ? { probes } : {}),
  }
  writeFileSync(join(root, 'stranger.config.json'), JSON.stringify(config, null, 2))
  const kane = join(root, 'kane-out')
  mkdirSync(kane)
  return { root, kane }
}

// A stand-in Supabase REST API for the replay. Each test sets how it answers:
// stranger: 'own' (only their rows) or 'all'; anon: 'refuse' (401), 'empty' or 'all'.
const api = { dir: null, stranger: 'own', anon: 'refuse', seen: [] }
let server
let API
before(async () => {
  server = createServer((req, res) => {
    const auth = req.headers.authorization ?? null
    api.seen.push({ method: req.method, auth, apikey: req.headers.apikey ?? null, url: req.url })
    const planted = api.dir && existsSync(join(api.dir, 'planted.txt')) ? readFileSync(join(api.dir, 'planted.txt'), 'utf8').trim().split('\n') : []
    const everyone = [{ note: 'stranger-control-x' }, ...planted.map((note) => ({ note }))]
    const mode = auth === 'Bearer tok-stranger' ? api.stranger : auth ? 'refuse' : api.anon
    if (mode === 'refuse') return res.writeHead(401).end('{"message":"no"}')
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(mode === 'all' ? everyone : mode === 'own' ? everyone.slice(0, 1) : []))
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  API = `http://127.0.0.1:${server.address().port}`
})
after(() => server.close())

function setApi(p, { stranger = 'own', anon = 'refuse' } = {}) {
  Object.assign(api, { dir: p.kane, stranger, anon, seen: [] })
}

const env = (p, modes) => ({ ...process.env, KANE_CLI_BIN: FAKE, FAKE_KANE_DIR: p.kane, FAKE_KANE_MODES: modes, FAKE_KANE_FORBID: PASSWORD, FAKE_KANE_API: API })

// Async, because spawnSync would block the stand-in API running in this same process.
function spawnAsync(args, opts) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { ...opts, stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => (stdout += d))
    child.stderr.on('data', (d) => (stderr += d))
    child.on('close', (status) => resolve({ status, stdout, stderr }))
    child.stdin.end(opts.input ?? '')
  })
}

async function run(p, modes) {
  if (api.dir !== p.kane) setApi(p)
  const r = await spawnAsync([BIN, 'run', '--json'], { cwd: p.root, env: env(p, modes) })
  let out = null
  try {
    out = JSON.parse(r.stdout.trim().split('\n').at(-1))
  } catch {}
  return { code: r.status, out, stderr: r.stderr, read: (f) => readFileSync(join(p.root, '.stranger', f), 'utf8') }
}

const calls = (p) => (existsSync(join(p.kane, 'calls.log')) ? readFileSync(join(p.kane, 'calls.log'), 'utf8').trim().split('\n') : [])

test('policies: the leaky Duebook read policy is found and flagged as open', async () => {
  const p = readPolicies(join(repo, 'supabase', 'migrations'), 'invoices')
  assert.equal(p.rls, true)
  assert.equal(p.ownerColumn, 'user_id')
  assert.deepEqual(p.select.map((s) => [s.name, s.using, s.open]), [['Enable read access for all users', 'true', true]])
})

test('policies: after the fix migration only the owner-only policy is left', async () => {
  const { root } = project({ migrations: [['0001_invoices.sql', LEAKY], ['0002_fix.sql', FIXED]] })
  const p = readPolicies(join(root, 'migrations'), 'invoices')
  assert.deepEqual(p.select.map((s) => [s.name, s.open]), [['Users can read their own invoices', false]])
})

test('policies: RLS turned off is noticed', async () => {
  const { root } = project({ migrations: [['0001.sql', 'create table notes (id int, owner uuid references auth.users(id));\nalter table public.notes disable row level security;']] })
  const p = readPolicies(join(root, 'migrations'), 'notes')
  assert.equal(p.rls, false)
  assert.equal(p.ownerColumn, 'owner')
})

test('LEAK on the page: exit 1, and the fix brief names the real open policy', async () => {
  const p = project()
  const r = await run(p, 'page-leak')
  assert.equal(r.code, 1, r.stderr)
  assert.equal(r.out.verdict, 'LEAK')
  const fix = r.read('FIX.md')
  assert.match(fix, /How it showed up: on the page/)
  assert.match(fix, /`"Enable read access for all users"` \(0001_invoices\.sql, for select to public\): `using \(true\)` \*\*This lets every account read every row/)
  assert.match(fix, /drop policy if exists "Enable read access for all users" on public\.invoices;/)
  assert.match(fix, /using \(\(select auth\.uid\(\)\) = user_id\);/)
  assert.deepEqual(calls(p), ['owner 1 page-leak', 'stranger 1 page-leak'])
})

test('LEAK on the network: a Kane that keeps response bodies is searched too', async () => {
  const p = project()
  const r = await run(p, 'network-leak')
  assert.equal(r.code, 1, r.stderr)
  assert.equal(r.out.verdict, 'LEAK')
  assert.match(r.out.why, /The page hid it, but the server sends the owner's canary to the stranger from http:\/\/127\.0\.0\.1:\d+\/rest\/v1\/invoices\./)
  const fix = r.read('FIX.md')
  assert.match(fix, /How it showed up: in what the server sent the stranger/)
  assert.match(fix, /\(table `invoices`\)/)
  // Kane's own log quotes the canary in the objective; only the HAR may count.
  assert.doesNotMatch(r.read('report.md'), /kane\.log/)
})

test('CLEAN: exit 0, and a stale fix brief is removed', async () => {
  const p = project()
  await run(p, 'page-leak')
  const r = await run(p, 'clean')
  assert.equal(r.code, 0, r.stderr)
  assert.equal(r.out.verdict, 'CLEAN')
  assert.equal(existsSync(join(p.root, '.stranger', 'FIX.md')), false)
  const history = r.read('history.jsonl').trim().split('\n').map((l) => JSON.parse(l))
  assert.deepEqual(history.map((h) => h.verdict), ['LEAK', 'CLEAN'])
  assert.equal(history[1].credits, 3)
})

test('INCONCLUSIVE when the stranger cannot see its own record, never CLEAN', async () => {
  const r = await run(project(), 'control-missing')
  assert.equal(r.code, 2)
  assert.equal(r.out.verdict, 'INCONCLUSIVE')
  assert.match(r.out.why, /could not see their own test record/)
})

test('INCONCLUSIVE when Kane does not start, and the stranger run is skipped', async () => {
  const p = project()
  const r = await run(p, 'no-credits')
  assert.equal(r.code, 2)
  assert.match(r.out.why, /Kane did not start/)
  assert.deepEqual(calls(p), ['owner 1 no-credits'])
})

test('probes: one leaking probe out of two makes the whole check LEAK', async () => {
  const p = project({
    probes: [
      { name: 'invoices', plant: 'click New invoice and type the text into the Note field', look: 'the Your invoices list' },
      { name: 'notes', plant: 'click New note and type the text', look: 'the Notes page' },
    ],
  })
  const r = await run(p, 'clean,network-leak')
  assert.equal(r.code, 1, r.stderr)
  assert.equal(r.out.verdict, 'LEAK')
  assert.match(r.out.why, /^1 of 2 probes leaked \(notes\)/)
  assert.deepEqual(r.out.probes.map((x) => [x.name, x.verdict]), [['invoices', 'CLEAN'], ['notes', 'LEAK']])
  assert.match(r.out.canary, /-2$/)
  assert.match(r.read('report.md'), /## Probes\n- \*\*invoices\*\*: CLEAN[\s\S]*- \*\*notes\*\*: LEAK/)
  assert.match(r.read('FIX.md'), /### notes/)
  assert.doesNotMatch(r.read('FIX.md'), /### invoices/)
  assert.equal(calls(p).length, 4)
})

test('probes: all clean is CLEAN, and a Kane that will not start stops the rest', async () => {
  const probes = [
    { name: 'a', plant: 'x', look: 'y' },
    { name: 'b', plant: 'x', look: 'y' },
  ]
  const clean = await run(project({ probes }), 'clean,clean')
  assert.equal(clean.out.verdict, 'CLEAN')
  assert.match(clean.out.why, /All 2 probes/)

  const p = project({ probes })
  const r = await run(p, 'no-credits,clean')
  assert.equal(r.out.verdict, 'INCONCLUSIVE')
  assert.deepEqual(calls(p), ['owner 1 no-credits'])
})

test('config: a probe without plant or look is a setup error', async () => {
  const p = project({ probes: [{ name: 'a', plant: 'x' }] })
  const r = await run(p, 'clean')
  assert.equal(r.code, 3)
  assert.match(r.stderr, /probe "a" needs "plant" and "look"/)
})

test('Stop hook: blocks on LEAK, nudges without re-running, lets go, then passes on CLEAN', async () => {
  const p = project()
  execFileSync('git', ['init', '-q'], { cwd: p.root })
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'init', '--allow-empty'], { cwd: p.root })
  setApi(p)
  const hook = async (modes, input) => {
    const r = await spawnAsync([HOOK], {
      cwd: p.root,
      input: JSON.stringify({ session_id: 's1', ...input }),
      env: { ...env(p, modes), CLAUDE_PROJECT_DIR: p.root, STRANGER_HOOK: '1' },
    })
    return JSON.parse(r.stdout)
  }

  const first = await hook('page-leak', { stop_hook_active: false })
  assert.equal(first.decision, 'block')
  assert.match(first.reason, /found a data leak/)
  assert.match(first.reason, /Enable read access for all users/)
  assert.equal(calls(p).length, 2)

  assert.match((await hook('page-leak', { stop_hook_active: true })).reason, /nothing in the watched files has changed/)
  assert.equal((await hook('page-leak', { stop_hook_active: true })).decision, 'block')
  const released = await hook('page-leak', { stop_hook_active: true })
  assert.equal(released.decision, undefined)
  assert.match(released.systemMessage, /Letting the agent stop/)
  assert.equal(calls(p).length, 2, 'nudges must not spend Kane runs')

  writeFileSync(join(p.root, 'migrations', '0002_fix.sql'), FIXED)
  const clean = await hook('clean', { stop_hook_active: false })
  assert.equal(clean.decision, undefined)
  assert.match(clean.systemMessage, /Stranger: CLEAN/)
  assert.equal(calls(p).length, 4)
})

test('replay: the page looks clean, but the server sends the owner\'s canary to the stranger', async () => {
  const p = project()
  setApi(p, { stranger: 'all', anon: 'refuse' })
  const r = await run(p, 'clean')
  assert.equal(r.code, 1, r.stderr)
  assert.equal(r.out.verdict, 'LEAK')
  assert.match(r.out.why, /The page hid it, but the server sends the owner's canary to the stranger from http:\/\/127\.0\.0\.1:\d+\/rest\/v1\/invoices\./)
  assert.doesNotMatch(r.out.why, /no login/)
  const fix = r.read('FIX.md')
  assert.match(fix, /How it showed up: in what the server sent the stranger/)
  assert.match(fix, /\(table `invoices`\)/)
  assert.match(r.read('report.md'), /With the stranger's login: GET .*\/rest\/v1\/invoices -> 200, \*\*owner's canary in the response\*\*/)
  assert.match(r.read('report.md'), /With no login: GET .*\/rest\/v1\/invoices -> 401/)
})

test('replay: with no login at all the API hands out the owner\'s rows (Duebook today)', async () => {
  const p = project()
  setApi(p, { stranger: 'all', anon: 'all' })
  const r = await run(p, 'page-leak')
  assert.equal(r.out.verdict, 'LEAK')
  assert.match(r.out.why, /found the owner's canary on the page\. The server sends it to the stranger from .*\. With no login at all, the API returns it too\./)
  assert.match(r.read('FIX.md'), /\*\*No login needed:\*\*/)
})

test('replay: only a logged-out leak still counts as LEAK', async () => {
  const p = project()
  setApi(p, { stranger: 'own', anon: 'all' })
  const r = await run(p, 'clean')
  assert.equal(r.out.verdict, 'LEAK')
  assert.match(r.out.why, /The stranger's page was clean, but with no login at all the API returns the owner's canary/)
  assert.match(r.read('FIX.md'), /How it showed up: in what the server sends with no login at all/)
})

test('replay: a locked-down API stays CLEAN, sends only GETs, and the logged-out try carries no token', async () => {
  const p = project()
  setApi(p, { stranger: 'own', anon: 'empty' })
  const r = await run(p, 'clean')
  assert.equal(r.out.verdict, 'CLEAN', r.stderr)
  const replays = api.seen
  assert.equal(replays.length, 2)
  assert.ok(replays.every((x) => x.method === 'GET' && x.apikey === 'public-anon-key'))
  assert.deepEqual(replays.map((x) => x.auth), ['Bearer tok-stranger', null])
  // The token is used, never written down.
  for (const f of ['report.md', 'history.jsonl', 'last.json']) assert.doesNotMatch(r.read(f), /tok-stranger/)
})

test('replay: proof from the server wins even when the page check went wrong', async () => {
  const p = project()
  setApi(p, { stranger: 'all' })
  const r = await run(p, 'control-missing')
  assert.equal(r.out.verdict, 'LEAK')
  assert.match(r.out.why, /The server sends the owner's canary to the stranger/)
})
