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
function project({ probes, personas, migrations = [['0001_invoices.sql', LEAKY]] } = {}) {
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
    ...(personas ? { personas } : {}),
  }
  writeFileSync(join(root, 'stranger.config.json'), JSON.stringify(config, null, 2))
  const kane = join(root, 'kane-out')
  mkdirSync(kane)
  return { root, kane }
}

// A stand-in Supabase: password sign-in plus a PostgREST-style invoices table whose row level security
// each test sets with setApi():
//   stranger:  'own' | 'all'              which rows a signed-in account can read
//   anon:      'refuse' | 'empty' | 'all' what a request with no login gets
//   write:     'own' | 'all'              which rows a signed-in account can change or delete
//   totals:    'own' | 'all'              what /rest/v1/totals adds up (an aggregate)
//   teammates: accounts that may also read the owner's rows
//   accounts:  { email: { password, user } } for sign-in
// Rows: the owner's canaries (from the stand-in Kane's planted.txt) and one row of the stranger's.
const api = {}
let server
let API

function sync() {
  if (!api.rows.some((r) => r.user_id === 'stranger')) api.rows.push({ id: api.nextId++, user_id: 'stranger', note: 'stranger-control-x', amount_cents: 100 })
  const file = api.dir && join(api.dir, 'planted.txt')
  const planted = file && existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n') : []
  for (const note of planted) {
    if (api.synced.has(note)) continue
    api.synced.add(note)
    api.rows.push({ id: api.nextId++, user_id: 'owner', note, amount_cents: 100 })
  }
}

before(async () => {
  server = createServer(async (req, res) => {
    let body = ''
    for await (const chunk of req) body += chunk
    const auth = req.headers.authorization ?? null
    const url = new URL(req.url, 'http://x')
    api.seen.push({ method: req.method, auth, apikey: req.headers.apikey ?? null, path: url.pathname, body })
    sync()
    const json = (status, data) => res.writeHead(status, { 'content-type': 'application/json' }).end(data === undefined ? '' : JSON.stringify(data))

    if (url.pathname === '/auth/v1/token') {
      const { email, password } = JSON.parse(body || '{}')
      const a = api.accounts[email]
      return a && a.password === password ? json(200, { access_token: `tok-${a.user}` }) : json(400, { error: 'invalid_grant' })
    }
    const who = auth?.startsWith('Bearer tok-') ? auth.slice('Bearer tok-'.length) : null
    if (auth && !who) return json(401, { message: 'bad token' })
    if (!who && api.anon === 'refuse') return json(401, { message: 'no' })
    const table = url.pathname.match(/^\/rest\/v1\/(\w+)/)?.[1]
    const canRead = (r) => (who ? api.stranger === 'all' || r.user_id === who || (r.user_id === 'owner' && api.teammates.includes(who)) : api.anon === 'all')
    if (table === 'totals') {
      const total = api.rows.filter((r) => api.totals === 'all' || r.user_id === who).reduce((sum, r) => sum + r.amount_cents, 0)
      return json(200, [{ total_cents: total }])
    }
    if (table !== 'invoices') return json(200, [])
    const id = url.searchParams.get('id')?.replace(/^eq\./, '')
    const match = (r) => id == null || String(r.id) === id
    if (req.method === 'GET') return json(200, api.rows.filter((r) => match(r) && canRead(r)))
    if (!who) return json(401, { message: 'no' })
    const writable = api.rows.filter((r) => match(r) && (api.write === 'all' || r.user_id === who))
    if (req.method === 'POST') {
      const row = JSON.parse(body)
      if (row.user_id && row.user_id !== who) return json(403, { message: 'new row violates row-level security policy' })
      const added = { ...row, id: row.id ?? api.nextId++, user_id: who }
      api.rows.push(added)
      return json(201, [added])
    }
    if (req.method === 'PATCH') {
      for (const r of writable) Object.assign(r, JSON.parse(body))
      return json(204)
    }
    if (req.method === 'DELETE') {
      api.rows = api.rows.filter((r) => !writable.includes(r))
      return json(204)
    }
    json(405, {})
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  API = `http://127.0.0.1:${server.address().port}`
})
after(() => server.close())

function setApi(p, { stranger = 'own', anon = 'refuse', write = 'own', totals = 'own', teammates = [], accounts = {} } = {}) {
  Object.assign(api, { dir: p.kane, stranger, anon, write, totals, teammates, accounts, rows: [], synced: new Set(), nextId: 1, seen: [] })
}

const env = (p, modes, extra = {}) => ({ ...process.env, ...extra, KANE_CLI_BIN: FAKE, FAKE_KANE_DIR: p.kane, FAKE_KANE_MODES: modes, FAKE_KANE_FORBID: PASSWORD, FAKE_KANE_API: API })

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

async function run(p, modes, extra) {
  if (api.dir !== p.kane) setApi(p)
  const r = await spawnAsync([BIN, 'run', '--json'], { cwd: p.root, env: env(p, modes, extra) })
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
  assert.doesNotMatch(r.out.why, /no login|When only the owner added a row/)
  const fix = r.read('FIX.md')
  assert.match(fix, /How it showed up: in what the server sent the stranger/)
  assert.match(fix, /\(table `invoices`\)/)
  assert.match(r.read('report.md'), /With the stranger's login: GET .*\/rest\/v1\/invoices \(both pages\) -> 200, \*\*owner's canary in the response\*\*/)
  assert.match(r.read('report.md'), /With no login: GET .*\/rest\/v1\/invoices \(both pages\) -> 401/)
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

test('replay: a locked-down API stays CLEAN, and every check leaves the owner\'s row as it was', async () => {
  const p = project()
  setApi(p, { stranger: 'own', anon: 'empty' })
  const r = await run(p, 'clean')
  assert.equal(r.out.verdict, 'CLEAN', r.stderr)
  // Reads with no login carry no token; nothing with no login ever writes.
  const anon = api.seen.filter((x) => !x.auth && x.path.startsWith('/rest/'))
  assert.ok(anon.length > 0 && anon.every((x) => x.method === 'GET' && x.apikey === 'public-anon-key'))
  // The stranger only ever tries writes on the owner's canary row (the tamper check).
  const strangerWrites = api.seen.filter((x) => x.auth === 'Bearer tok-stranger' && x.method !== 'GET')
  assert.deepEqual(strangerWrites.map((x) => x.method), ['PATCH', 'DELETE'])
  // The canary row is untouched and the numeric canary's extra row is gone.
  const mine = api.rows.filter((x) => x.user_id === 'owner')
  assert.deepEqual(mine.map((x) => x.note), [r.out.canary])
  assert.match(r.read('report.md'), /## Numeric canary[\s\S]*Nothing the stranger reads changed/)
  assert.match(r.read('report.md'), /Change `note`: blocked[\s\S]*Delete: blocked/)
  for (const f of ['report.md', 'history.jsonl', 'last.json']) assert.doesNotMatch(r.read(f), /tok-stranger|tok-owner/)
})

test('replay: proof from the server wins even when the page check went wrong', async () => {
  const p = project()
  setApi(p, { stranger: 'all' })
  const r = await run(p, 'control-missing')
  assert.equal(r.out.verdict, 'LEAK')
  assert.match(r.out.why, /The server sends the owner's canary to the stranger/)
})

test('owner-page reads: a table only the owner\'s page reads still gets checked as the stranger', async () => {
  const p = project()
  setApi(p, { stranger: 'all' })
  const r = await run(p, 'clean', { FAKE_KANE_STRANGER_TABLE: 'dashboard' })
  assert.equal(r.out.verdict, 'LEAK')
  assert.match(r.out.why, /a read from the owner's page, sent with the stranger's login, returns the owner's canary/)
})

test('tamper: the stranger can change and delete the owner\'s row, and Stranger puts it back', async () => {
  const p = project()
  setApi(p, { stranger: 'own', write: 'all' })
  const r = await run(p, 'clean')
  assert.equal(r.code, 1, r.stderr)
  assert.equal(r.out.verdict, 'TAMPER')
  assert.match(r.out.why, /The stranger could change and delete the owner's row in `invoices`\. \(Page check: CLEAN\.\)/)
  const fix = r.read('FIX.md')
  assert.match(fix, /# Stranger found that the stranger can change the owner's data/)
  assert.match(fix, /`"Users can update their own invoices"` \(0001_invoices\.sql, for update\)/)
  assert.match(fix, /for delete to authenticated/)
  assert.deepEqual(api.rows.filter((x) => x.user_id === 'owner').map((x) => x.note), [r.out.canary])
})

test('numeric canary: a total that counts the owner\'s rows is a LEAK even with no canary text', async () => {
  const p = project()
  setApi(p, { stranger: 'own', totals: 'all' })
  const r = await run(p, 'clean', { FAKE_KANE_TOTALS: '1' })
  assert.equal(r.out.verdict, 'LEAK', r.stderr)
  assert.match(r.out.why, /When only the owner added a row \(odd number amount_cents = 7331\), 1 of the stranger's reads changed: .*\/rest\/v1\/totals/)
  assert.match(r.read('FIX.md'), /security_invoker = true/)
  assert.equal(api.rows.filter((x) => String(x.note).endsWith('-n')).length, 0, 'the extra row is removed')
})

test('personas: a teammate locked out is OVERLOCKED; sharing fixes it; a removed member who still sees is a LEAK', async () => {
  const accounts = { 'mate@duebook.demo': { password: 'pw-mate', user: 'mate' }, 'gone@duebook.demo': { password: 'pw-gone', user: 'gone' } }
  const personas = [
    { name: 'teammate', email: 'mate@duebook.demo', password: 'pw-mate', expect: 'see' },
    { name: 'removed member', email: 'gone@duebook.demo', password: 'pw-gone', expect: 'hide' },
  ]
  let p = project({ personas })
  setApi(p, { accounts })
  let r = await run(p, 'clean')
  assert.equal(r.out.verdict, 'OVERLOCKED', r.stderr)
  assert.match(r.out.why, /teammate \(mate@duebook\.demo\) should see the owner's records, but the API does not give them the canary/)
  assert.match(r.read('FIX.md'), /membership check/)

  p = project({ personas })
  setApi(p, { accounts, teammates: ['mate'] })
  r = await run(p, 'clean')
  assert.equal(r.out.verdict, 'CLEAN', r.out.why)

  p = project({ personas })
  setApi(p, { accounts, teammates: ['mate', 'gone'] })
  r = await run(p, 'clean')
  assert.equal(r.out.verdict, 'LEAK')
  assert.match(r.out.why, /removed member \(gone@duebook\.demo\) should not see the owner's records, but the API gives them the canary/)
})

test('coverage: a user-data table no probe reaches is listed as not checked', async () => {
  const notes = 'create table public.notes (id uuid primary key, user_id uuid references auth.users (id), body text);'
  const p = project({ migrations: [['0001_invoices.sql', LEAKY], ['0002_notes.sql', notes]] })
  const r = await run(p, 'clean')
  assert.equal(r.out.coverage, '1/2')
  assert.match(r.read('report.md'), /1 of 2 user-data tables were read during this check \(`invoices`\)\.\nNot checked: `notes`/)
})
