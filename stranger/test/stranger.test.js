// Runs Stranger end to end against a stand-in Kane (fake-kane.js), so no Kane credits are spent.
// Usage: npm test   (needs git and zip on PATH)
import { test, before, after } from 'node:test'
import { createServer } from 'node:http'
import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readPolicies } from '../src/policies.js'
import { recordLinks } from '../src/check.js'

const here = fileURLToPath(new URL('.', import.meta.url))
const repo = join(here, '..', '..')
const BIN = join(here, '..', 'bin', 'stranger.js')
const HOOK = join(here, '..', 'hooks', 'claude-stop.js')
const FAKE = join(here, 'fake-kane.js')
const FAKE_CLAUDE = join(here, 'fake-claude.js')
const FIX_LOOP = join(repo, 'scripts', 'fix-loop.mjs')
const PASSWORD = 'not-a-real-password-7731'
const token = (user) => `test.${Buffer.from(JSON.stringify({ sub: user })).toString('base64url')}.signature`

const LEAKY = readFileSync(join(repo, 'supabase', 'migrations', '0001_invoices.sql'), 'utf8')
const FIXED = `drop policy if exists "Enable read access for all users" on public.invoices;
create policy "Users can read their own invoices"
  on public.invoices for select to authenticated
  using ((select auth.uid()) = user_id);`

// A throwaway project with a config, two accounts and the Duebook migrations.
function project({ probes, personas, migrations = [['0001_invoices.sql', LEAKY]], options } = {}) {
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
    ...options,
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
//   insert:    'own' | 'any'              whether a new row may name another account as its owner
//   rpc:       'own' | 'all'              what POST /rest/v1/rpc/<any> returns
//   files:     'private' | 'shared' | 'public'  who may download a stored file
//   realtime:  null | 'private' | 'broadcast' | 'changes'  the live-updates socket (null: no socket)
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
    api.seen.push({ method: req.method, auth, apikey: req.headers.apikey ?? null, path: url.pathname, query: url.search, prefer: req.headers.prefer ?? null, body })
    sync()
    const json = (status, data, headers = {}) => res.writeHead(status, { 'content-type': 'application/json', ...headers }).end(data === undefined ? '' : JSON.stringify(data))

    if (url.pathname === '/auth/v1/token') {
      const { email, password } = JSON.parse(body || '{}')
      const a = api.accounts[email]
      return a && a.password === password ? json(200, { access_token: token(a.user) }) : json(400, { error: 'invalid_grant' })
    }
    const payload = auth?.match(/^Bearer test\.([A-Za-z0-9_-]+)\.signature$/)?.[1]
    const who = payload ? JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')).sub : null
    if (auth && !who) return json(401, { message: 'bad token' })
    if (url.pathname.startsWith('/storage/v1/object/')) return storage(req, url, who, body, json, res)
    if (!who && api.anon === 'refuse') return json(401, { message: 'no' })
    const fn = url.pathname.match(/^\/rest\/v1\/rpc\/(\w+)/)?.[1]
    if (fn) return json(200, api.rows.filter((r) => api.rpc === 'all' || r.user_id === who))
    const table = url.pathname.match(/^\/rest\/v1\/(\w+)/)?.[1]
    const canRead = (r) => (who ? api.stranger === 'all' || r.user_id === who || (r.user_id === 'owner' && api.teammates.includes(who)) : api.anon === 'all')
    if (table === 'totals') {
      const total = api.rows.filter((r) => api.totals === 'all' || r.user_id === who).reduce((sum, r) => sum + r.amount_cents, 0)
      return json(200, [{ total_cents: total }])
    }
    if (table !== 'invoices') return json(200, [])
    // PostgREST-style "column=eq.value" filters on any column.
    const filters = [...url.searchParams].filter(([k, v]) => v.startsWith('eq.') && !['select', 'order'].includes(k)).map(([k, v]) => [k, v.slice(3)])
    const match = (r) => filters.every(([k, v]) => String(r[k]) === v)
    if (req.method === 'GET') {
      const rows = api.rows.filter((r) => match(r) && canRead(r))
      const page = rows.slice(0, api.responseLimit)
      const exact = req.headers.prefer === 'count=exact' || api.exactCount
      const range = `${page.length ? `0-${page.length - 1}` : '*'}/${exact ? rows.length : '*'}`
      return json(200, page, { 'Content-Range': range })
    }
    if (!who) return json(401, { message: 'no' })
    const writable = api.rows.filter((r) => match(r) && (api.write === 'all' || r.user_id === who))
    if (req.method === 'POST') {
      const row = JSON.parse(body)
      if (row.user_id && row.user_id !== who && api.insert !== 'any') return json(403, { message: 'new row violates row-level security policy' })
      const added = { ...row, id: row.id ?? api.nextId++, user_id: row.user_id ?? who }
      api.rows.push(added)
      liveInsert(added)
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
  server.on('upgrade', liveSocket)
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  API = `http://127.0.0.1:${server.address().port}`
})
after(() => {
  for (const c of sockets) c.socket.destroy()
  server.close()
})

// Stand-in Supabase Storage: upload, download (signed in or public), list and delete.
function storage(req, url, who, body, json, res) {
  const parts = url.pathname.slice('/storage/v1/object/'.length).split('/').map(decodeURIComponent)
  // A public bucket only opens the /public/ download address; listings still follow the policies.
  const mayRead = (f) => f.owner === who || (who && api.files === 'shared')
  if (req.method === 'POST' && parts[0] === 'list') {
    if (!who) return json(200, [])
    const { prefix = '' } = JSON.parse(body || '{}')
    return json(200, api.stored.filter((f) => f.bucket === parts[1] && f.path.startsWith(prefix) && mayRead(f)).map((f) => ({ name: f.path.split('/').at(-1) })))
  }
  if (req.method === 'GET' && (parts[0] === 'authenticated' || parts[0] === 'public')) {
    const f = api.stored.find((x) => x.bucket === parts[1] && x.path === parts.slice(2).join('/'))
    const ok = f && (parts[0] === 'public' ? api.files === 'public' : who && mayRead(f))
    return ok ? res.writeHead(200, { 'content-type': 'text/plain' }).end(f.body) : json(400, { error: 'not_found' })
  }
  if (!who) return json(400, { error: 'unauthorized' })
  if (req.method === 'POST') {
    const [bucket, ...path] = parts
    api.stored = api.stored.filter((f) => !(f.bucket === bucket && f.path === path.join('/')))
    api.stored.push({ bucket, path: path.join('/'), owner: who, body })
    return json(200, { Key: parts.join('/') })
  }
  if (req.method === 'DELETE') {
    const { prefixes = [] } = JSON.parse(body || '{}')
    api.stored = api.stored.filter((f) => !(f.bucket === parts[0] && prefixes.includes(f.path) && f.owner === who))
    return json(200, [])
  }
  json(405, {})
}

// Stand-in Supabase Realtime: a bare WebSocket (Phoenix vsn 1.0.0 messages). "broadcast" sends each new
// row on the public topic invoices:<owner>, "changes" sends it to every database-changes subscriber.
const sockets = new Set()
function liveSocket(req, socket) {
  if (!api.realtime || !req.url.startsWith('/realtime/v1/websocket')) return socket.destroy()
  const accept = createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64')
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`)
  const client = { socket, topics: new Map() }
  sockets.add(client)
  let buf = Buffer.alloc(0)
  socket.on('data', (d) => {
    buf = Buffer.concat([buf, d])
    while (buf.length >= 2) {
      let len = buf[1] & 0x7f
      let off = 2
      if (len === 126) [len, off] = [buf.length >= 4 ? buf.readUInt16BE(2) : Infinity, 4]
      const masked = buf[1] & 0x80 ? 4 : 0
      if (buf.length < off + masked + len) return
      const data = Buffer.from(buf.subarray(off + masked, off + masked + len))
      if (masked) for (let i = 0; i < data.length; i++) data[i] ^= buf[off + (i % 4)]
      const op = buf[0] & 0x0f
      buf = buf.subarray(off + masked + len)
      if (op === 8) return socket.end()
      if (op !== 1) continue
      const m = JSON.parse(data.toString('utf8'))
      if (m.event !== 'phx_join') continue
      client.topics.set(m.topic.replace(/^realtime:/, ''), m.payload?.config?.postgres_changes ?? [])
      send(client, { topic: m.topic, event: 'phx_reply', payload: { status: 'ok', response: {} }, ref: m.ref })
    }
  })
  const gone = () => sockets.delete(client)
  socket.on('close', gone)
  socket.on('error', gone)
}
function send(client, msg) {
  const data = Buffer.from(JSON.stringify(msg))
  const head = data.length < 126 ? Buffer.from([0x81, data.length]) : Buffer.from([0x81, 126, data.length >> 8, data.length & 255])
  client.socket.write(Buffer.concat([head, data]))
}
function liveInsert(row) {
  for (const c of sockets) {
    for (const [topic, changes] of c.topics) {
      if (api.realtime === 'broadcast' && topic === `invoices:${row.user_id}`) send(c, { topic: `realtime:${topic}`, event: 'broadcast', payload: { type: 'broadcast', event: 'new_row', payload: { record: row } }, ref: null })
      if (api.realtime === 'changes' && changes.some((x) => x.table === 'invoices')) send(c, { topic: `realtime:${topic}`, event: 'postgres_changes', payload: { data: { type: 'INSERT', record: row } }, ref: null })
    }
  }
}

function setApi(p, { stranger = 'own', anon = 'refuse', write = 'own', totals = 'own', teammates = [], accounts = {}, rows = [], responseLimit = Infinity, exactCount = false, insert = 'own', rpc = 'own', files = 'private', realtime = null } = {}) {
  const seeded = rows.map((row, i) => ({ amount_cents: 100, id: i + 1, ...row }))
  Object.assign(api, { dir: p.kane, stranger, anon, write, totals, teammates, accounts, exactCount, responseLimit, insert, rpc, files, realtime, stored: [], heard: [], rows: seeded, synced: new Set(), nextId: seeded.length + 1, seen: [] })
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

async function run(p, modes, extra, json = true) {
  if (api.dir !== p.kane) setApi(p)
  const r = await spawnAsync([BIN, 'run', ...(json ? ['--json'] : [])], { cwd: p.root, env: env(p, modes, extra) })
  let out = null
  try {
    out = JSON.parse(r.stdout.trim().split('\n').at(-1))
  } catch {}
  return { code: r.status, out, stdout: r.stdout, stderr: r.stderr, read: (f) => readFileSync(join(p.root, '.stranger', f), 'utf8') }
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
  assert.doesNotMatch(r.read('report.md'), /kane\.log|Synthetic HAR Client/)
  assert.doesNotMatch(r.read('last.json'), /Synthetic HAR Client/)
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
  // The stranger only ever tries writes on the owner's canary row (tamper) and a forged copy of it in
  // the owner's name (forge, refused here, so there is nothing to delete).
  const strangerWrites = api.seen.filter((x) => x.auth === `Bearer ${token('stranger')}` && x.method !== 'GET')
  assert.deepEqual(strangerWrites.map((x) => x.method), ['PATCH', 'DELETE', 'POST'])
  assert.match(strangerWrites[2].body, /-f"/)
  // The canary row is untouched and the numeric canary's extra row is gone.
  const mine = api.rows.filter((x) => x.user_id === 'owner')
  assert.deepEqual(mine.map((x) => x.note), [r.out.canary])
  assert.match(r.read('report.md'), /## Numeric canary[\s\S]*Nothing the stranger reads changed/)
  assert.match(r.read('report.md'), /Change `note`: blocked[\s\S]*Delete: blocked/)
  for (const f of ['report.md', 'history.jsonl', 'last.json']) {
    for (const user of ['owner', 'stranger']) assert.ok(!r.read(f).includes(token(user)))
  }
})

function rowsFor() {
  // The fake owner adds the eighth row when it plants the canary.
  return ['account-a', 'account-a', 'account-b', 'account-b', 'owner', 'stranger', 'stranger'].map((user_id) => ({
    user_id,
    client_name: 'Synthetic Replay Client',
    client_email: 'synthetic-replay-client@invalid.test',
    note: 'Synthetic replay note',
  }))
}

const blastProject = (blast) => project({ options: { numeric: false, tamper: false, blast } })
const invoiceCounts = (r) => r.out.blast.find(({ table }) => table === 'invoices')

test('blast radius: counts six rows across three other accounts and keeps row values private', async () => {
  const p = blastProject()
  setApi(p, { stranger: 'all', rows: rowsFor() })
  const r = await run(p, 'clean')
  assert.equal(r.out.verdict, 'LEAK', r.stderr)
  const blast = invoiceCounts(r)
  assert.deepEqual(blast.stranger, { rows: 8, othersRows: 6, accounts: 3, capped: false })
  assert.equal(blast.anonymous, null)
  assert.deepEqual(blast.sensitive, ['amount_cents', 'client_email', 'note'])
  assert.match(r.read('report.md'), /## Blast radius[\s\S]*stranger reads 6 rows from 3 other accounts/)
  assert.match(r.read('FIX.md'), /^Impact: .*6 rows from 3 other accounts/m)
  const history = JSON.parse(r.read('history.jsonl'))
  assert.deepEqual(history.blast, [{ table: 'invoices', stranger: blast.stranger, anonymous: null }])
  for (const output of [r.stdout, r.read('report.md'), r.read('FIX.md'), r.read('history.jsonl'), r.read('last.json')]) {
    assert.doesNotMatch(output, /Synthetic Replay Client|synthetic-replay-client@invalid\.test/)
  }
})

test('blast radius: a clean run reports none and tracks the count dropping to zero', async () => {
  const p = blastProject()
  setApi(p, { stranger: 'all', rows: rowsFor() })
  await run(p, 'clean')
  setApi(p, { rows: rowsFor() })
  const r = await run(p, 'clean', {}, false)
  assert.equal(r.code, 0, r.stderr)
  assert.match(r.stderr, /Blast radius[\s\S]*invoices\s+stranger reads none/)
  const history = r.read('history.jsonl').trim().split('\n').map(JSON.parse)
  assert.deepEqual(history.map((entry) => entry.blast[0].stranger.othersRows), [6, 0])
})

test('blast radius: every row returned without a login counts', async () => {
  const p = blastProject()
  setApi(p, { anon: 'all', rows: rowsFor() })
  const r = await run(p, 'clean')
  assert.equal(r.out.verdict, 'LEAK')
  assert.deepEqual(invoiceCounts(r).anonymous, { rows: 8, othersRows: 8, accounts: 4, capped: false })
})

test('blast radius: keeps captured filters even when the stand-in policy is open', async () => {
  const p = blastProject()
  setApi(p, { stranger: 'all', rows: rowsFor() })
  const r = await run(p, 'clean', { FAKE_KANE_FILTERED: '1' })
  assert.equal(r.out.verdict, 'CLEAN')
  assert.equal(invoiceCounts(r).stranger.othersRows, 0)
  assert.equal(api.seen.length, 2)
  assert.ok(api.seen.every(({ method, query }) => method === 'GET' && query.includes('user_id=eq.stranger')))
})

test('blast radius: disabling it omits the counts and uses the same requests', async () => {
  const enabled = blastProject()
  const disabled = blastProject(false)
  setApi(enabled, { stranger: 'all', rows: rowsFor() })
  await run(enabled, 'clean')
  const requests = api.seen
  setApi(disabled, { stranger: 'all', rows: rowsFor() })
  const r = await run(disabled, 'clean')
  assert.equal(r.out.verdict, 'LEAK')
  assert.equal(Object.hasOwn(r.out, 'blast'), false)
  assert.equal(Object.hasOwn(JSON.parse(r.read('history.jsonl')), 'blast'), false)
  assert.doesNotMatch(r.read('report.md'), /Blast radius/)
  const same = (list) => list.map((x) => JSON.stringify(x).replace(/stranger-canary-[0-9a-f]+/g, 'CANARY'))
  assert.deepEqual(same(api.seen), same(requests))
})

test('blast radius: caps the sample and uses an exact total when the response provides one', async () => {
  const p = blastProject()
  const settings = {
    stranger: 'all',
    anon: 'all',
    rows: Array.from({ length: 1498 }, () => ({ user_id: 'account-a' })),
    responseLimit: 1000,
    exactCount: true,
  }
  setApi(p, settings)
  const r = await run(p, 'page-leak')
  assert.deepEqual(invoiceCounts(r).stranger, { rows: 1500, othersRows: 1000, accounts: 1, capped: true })
  assert.ok(api.seen.every(({ prefer }) => prefer === null))
  setApi(p, settings)
  const human = await run(p, 'page-leak', {}, false)
  assert.match(human.stderr, /stranger reads 1000\+ rows/)
  assert.match(human.stderr, /with no login 1000\+ rows/)
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

const OPEN_INSERT = LEAKY.replace(/with check \(\(select auth\.uid\(\)\) = user_id\);\n\ncreate policy "Users can update/, 'with check (true);\n\ncreate policy "Users can update')
// Rows Stranger added itself (forged "-f", live-update "-r"), which must be gone after a run.
const owned = (p) => api.rows.filter((r) => /^stranger-canary-[0-9a-f]+-[fr]$/.test(String(r.note)))
const objectives = (p) => readFileSync(join(p.kane, 'objectives.log'), 'utf8')

test('forged owner: the stranger can add a row in the owner\'s name, and the brief asks for a "with check"', async () => {
  const p = project({ migrations: [['0001_invoices.sql', OPEN_INSERT]] })
  setApi(p, { insert: 'any' })
  const r = await run(p, 'clean')
  assert.equal(r.code, 1, r.stderr)
  assert.equal(r.out.verdict, 'TAMPER')
  assert.match(r.out.why, /create a row in `invoices` that names the owner in `user_id`/)
  const fix = r.read('FIX.md')
  assert.match(fix, /`"Users can insert their own invoices"` \(0001_invoices\.sql, for insert\): `with check \(true\)` \*\*checks nothing about the owner\*\*/)
  assert.match(fix, /drop policy if exists "Users can insert their own invoices" on public\.invoices;/)
  assert.match(fix, /for insert to authenticated\n  with check \(\(select auth\.uid\(\)\) = user_id\);/)
  assert.doesNotMatch(fix, /UPDATE and DELETE policies on `invoices` don't check/)
  assert.match(r.read('report.md'), /## Forged owner[\s\S]*It was stored[\s\S]*Deleted again afterwards: yes/)
  assert.deepEqual(owned(p), [], 'the forged row is deleted again')
  assert.deepEqual(JSON.parse(r.read('history.jsonl').trim().split('\n').at(-1)).findings, ['TAMPER:forged'])
})

test('forged owner: refused by the insert policy is CLEAN', async () => {
  const p = project()
  setApi(p, { insert: 'own' })
  const r = await run(p, 'clean')
  assert.equal(r.out.verdict, 'CLEAN', r.out.why)
  assert.match(r.read('report.md'), /## Forged owner[\s\S]*Refused: no such row was stored\./)
})

test('files: a bucket any signed-in account can read is a LEAK, and the file is deleted again', async () => {
  const p = project()
  setApi(p, { files: 'shared' })
  const r = await run(p, 'clean', { FAKE_KANE_BUCKET: 'receipts' }, false)
  assert.equal(r.code, 1)
  const last = JSON.parse(r.read('last.json'))
  assert.equal(last.verdict, 'LEAK')
  assert.equal(last.seen, 'storage')
  assert.match(last.why, /The owner's file in the `receipts` storage bucket: the stranger could download it, the stranger could see it in a listing\./)
  assert.match(r.stderr, /files in receipts: stranger could download/)
  const fix = r.read('FIX.md')
  assert.match(fix, /update storage\.buckets set public = false where id = 'receipts';/)
  assert.match(fix, /\(storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)\)::text/)
  assert.doesNotMatch(fix, /Replace the open policy/, 'a file leak is not the table read policy')
  assert.deepEqual(api.stored, [])
  // The owner uploaded into its own folder first.
  assert.ok(api.seen.some((x) => x.method === 'POST' && x.path.startsWith('/storage/v1/object/receipts/owner/stranger-')))
})

test('files: a public bucket hands the file to anyone with no login', async () => {
  const p = project()
  setApi(p, { files: 'public' })
  const r = await run(p, 'clean', { FAKE_KANE_BUCKET: 'receipts' })
  assert.equal(r.out.verdict, 'LEAK')
  assert.match(r.out.why, /anyone with no login could download it/)
})

test('files: a private bucket is CLEAN', async () => {
  const p = project()
  setApi(p, { files: 'private' })
  const r = await run(p, 'clean', { FAKE_KANE_BUCKET: 'receipts' })
  assert.equal(r.out.verdict, 'CLEAN', r.out.why)
  assert.match(r.read('report.md'), /- `receipts`: stranger download blocked \(HTTP 400\), stranger list blocked \(HTTP 200\), no login download blocked \(HTTP 400\), no login list blocked \(HTTP 200\)\. File deleted afterwards\./)
})

const DEFINER = (volatility) => `create or replace function public.my_invoices() returns setof public.invoices language sql ${volatility} security definer as $$ select * from public.invoices $$;`

test('database functions: a stable function that returns every account\'s rows is a LEAK', async () => {
  const p = project({ migrations: [['0001_invoices.sql', LEAKY], ['0002_fn.sql', DEFINER('stable')]] })
  setApi(p, { rpc: 'all' })
  const r = await run(p, 'clean', { FAKE_KANE_RPC: 'my_invoices' }, false)
  const last = JSON.parse(r.read('last.json'))
  assert.equal(last.verdict, 'LEAK', last.why)
  assert.match(last.why, /\/rest\/v1\/rpc\/my_invoices/)
  assert.match(r.stderr, /stranger's login\s+POST .*\/rest\/v1\/rpc\/my_invoices -> 200, owner's canary in it/)
  const fix = r.read('FIX.md')
  assert.match(fix, /`my_invoices\(\)`, a database function the app calls\. It is `security definer`/)
  assert.match(fix, /alter function public\.my_invoices\(\) security invoker;/)
  assert.doesNotMatch(fix, /Replace the open policy/, 'the table policy is not what leaks here')
})

test('database functions: a page that only calls functions (no GET at all) still gets them sent with the stranger\'s login', async () => {
  const p = project({ migrations: [['0001_invoices.sql', LEAKY], ['0002_fn.sql', DEFINER('stable')]] })
  setApi(p, { rpc: 'all' })
  const r = await run(p, 'clean', { FAKE_KANE_RPC: 'my_invoices', FAKE_KANE_ONLY_RPC: '1' })
  assert.equal(r.out.verdict, 'LEAK', r.out.why)
  assert.ok(api.seen.some((x) => x.path === '/rest/v1/rpc/my_invoices' && x.auth === `Bearer ${token('stranger')}`), "called with the stranger's login")
  assert.match(r.out.why, /the server sends the owner's canary to the stranger from .*\/rpc\/my_invoices/)
})

test('database functions: one that may write is never called, only listed', async () => {
  const p = project({ migrations: [['0001_invoices.sql', LEAKY], ['0002_fn.sql', DEFINER('')]] })
  setApi(p, { rpc: 'all' })
  const r = await run(p, 'clean', { FAKE_KANE_RPC: 'my_invoices' })
  assert.equal(r.out.verdict, 'CLEAN', r.out.why)
  assert.ok(!api.seen.some((x) => x.path.startsWith('/rest/v1/rpc/')), 'no call to the function')
  assert.match(r.read('report.md'), /Not sent again: POST http:\/\/127\.0\.0\.1:\d+\/rest\/v1\/rpc\/my_invoices \(may write \(not marked stable\)\)/)
})

test('live updates: a broadcast on a guessable public topic is a LEAK, with the owner\'s id kept out of the report', async () => {
  const p = project()
  setApi(p, { realtime: 'broadcast' })
  const r = await run(p, 'clean')
  assert.equal(r.out.verdict, 'LEAK', r.out.why)
  assert.match(r.out.why, /broadcast on `invoices:\{owner\}`/)
  const fix = r.read('FIX.md')
  assert.match(fix, /on realtime\.messages/)
  assert.match(fix, /config: \{ private: true \}/)
  assert.doesNotMatch(fix, /Replace the open policy/)
  assert.deepEqual(owned(p), [], 'the row it listened for is deleted again')
})

test('live updates: database changes sent to everyone point at the table read policy', async () => {
  const p = project()
  setApi(p, { realtime: 'changes' })
  const r = await run(p, 'clean')
  assert.equal(r.out.verdict, 'LEAK', r.out.why)
  assert.match(r.out.why, /received the owner's new row the moment it was saved \(database changes on `invoices`\)/)
  assert.match(r.read('FIX.md'), /drop policy if exists "Enable read access for all users" on public\.invoices;/)
})

test('live updates: nothing heard on private channels is CLEAN', async () => {
  const p = project()
  setApi(p, { realtime: 'private' })
  const r = await run(p, 'clean')
  assert.equal(r.out.verdict, 'CLEAN', r.out.why)
  assert.match(r.read('report.md'), /## Live updates[\s\S]*Joined: `database changes on invoices`, `invoices:\{owner\}`[\s\S]*Heard nothing of the owner's row\./)
})

test('direct links: the list hides the record, but its own page shows it to the stranger', async () => {
  const link = 'http://localhost:5231/duebook/invoice/123e4567-e89b-12d3-a456-426614174000'
  const p = project()
  setApi(p)
  const r = await run(p, 'link-leak', { FAKE_KANE_LINK: link })
  assert.equal(r.out.verdict, 'LEAK', r.out.why)
  assert.match(r.out.why, /on the owner's own record page, opened directly \(http:\/\/localhost:5231\/duebook\/invoice\/123e4567-e89b-12d3-a456-426614174000\), though the list hid it/)
  assert.match(objectives(p), new RegExp(`stranger: .*Then go directly to ${link} and verify`))
  assert.match(r.read('FIX.md'), /How it showed up: on the owner's own record page, which the stranger opened by its address/)
  assert.match(r.read('report.md'), /opened the owner's own record page directly[\s\S]*The owner's canary showed there/)
})

test('direct links: a record page loaded by a security definer function gets that function named in the brief', async () => {
  const getter = 'create or replace function public.get_invoice(invoice_id uuid) returns setof public.invoices language sql stable security definer as $$ select * from public.invoices where id = invoice_id $$;'
  const p = project({ migrations: [['0001_invoices.sql', LEAKY], ['0002_fix.sql', FIXED], ['0003_get.sql', getter]] })
  setApi(p)
  const r = await run(p, 'link-leak', { FAKE_KANE_LINK: 'http://localhost:5231/duebook/invoice/123e4567-e89b-12d3-a456-426614174000', FAKE_KANE_RPC: 'get_invoice' })
  assert.equal(r.out.verdict, 'LEAK', r.out.why)
  const fix = r.read('FIX.md')
  assert.match(fix, /The pages called `get_invoice\(\)` \(0003_get\.sql\): a `security definer` function that takes the record's id/)
  assert.match(fix, /alter function public\.get_invoice security invoker;/)
  assert.doesNotMatch(fix, /Each account should only get its own rows back/, 'the table policy is already owner-only')
  assert.match(r.read('report.md'), /Not sent again: POST .*\/rest\/v1\/rpc\/get_invoice \(takes arguments Kane did not log\)/)
})

test('direct links: "links": false keeps the stranger on the list page', async () => {
  const p = project({ options: { links: false } })
  setApi(p)
  const r = await run(p, 'link-leak', { FAKE_KANE_LINK: 'http://localhost:5231/duebook/invoice/123e4567-e89b-12d3-a456-426614174000' })
  assert.equal(r.out.verdict, 'CLEAN', r.out.why)
  assert.doesNotMatch(objectives(p), /go directly to/)
})

test('direct links: only same-site addresses that name one record, never the start page', () => {
  const start = 'https://app.example/duebook/'
  assert.deepEqual(
    recordLinks(
      [
        start,
        'https://app.example/duebook/settings',
        'https://other.example/invoice/123e4567-e89b-12d3-a456-426614174000',
        'https://app.example/duebook/invoice/123e4567-e89b-12d3-a456-426614174000?x-vercel-protection-bypass=s3cret',
        'https://app.example/duebook/?id=4521',
        'https://app.example/duebook/?id=4521#top',
        'https://app.example/duebook/notes/9f86d081884c7d659a2feaa0c55ad015',
      ],
      start,
    ),
    ['https://app.example/duebook/invoice/123e4567-e89b-12d3-a456-426614174000', 'https://app.example/duebook/?id=4521'],
  )
})

const loop = (p, modes, extra = {}) =>
  spawnAsync([FIX_LOOP, '--root', p.root], {
    cwd: p.root,
    env: { ...env(p, modes), APP_URL: 'http://localhost:5231/duebook/', CLAUDE_BIN: FAKE_CLAUDE, FAKE_CLAUDE_HOOK: HOOK, FAKE_CLAUDE_SQL: FIXED, ...extra },
  })
const loopResult = (p) => [JSON.parse(readFileSync(join(p.root, 'fix-loop.json'), 'utf8')), readFileSync(join(p.root, 'fix-loop.md'), 'utf8')]

test('fix loop: LEAK, the agent writes a migration, the hook re-runs Stranger and it says CLEAN', async () => {
  const p = project()
  setApi(p)
  const r = await loop(p, 'page-leak')
  assert.equal(r.status, 0, r.stderr)
  const [s, md] = loopResult(p)
  assert.equal(s.before.verdict, 'LEAK')
  assert.equal(s.after.verdict, 'CLEAN')
  assert.notEqual(s.after.canary, s.before.canary, 'the re-run plants a fresh canary')
  assert.deepEqual(s.migrations, ['0002_fix.sql'])
  assert.equal(s.push, true)
  assert.match(md, /^<!-- stranger-fix -->/)
  assert.match(md, /\*\*Before: 🚨 LEAK\*\*[\s\S]*It wrote <code>migrations\/0002_fix\.sql<\/code>[\s\S]*create policy "Users can read their own invoices"[\s\S]*\*\*After \(the Stop hook's re-run, fresh canary\): ✅ CLEAN\*\*/)
  assert.equal(existsSync(join(p.root, '.stranger', 'armed')), false, 'the hook is disarmed afterwards')
  assert.deepEqual(calls(p), ['owner 1 page-leak', 'stranger 1 page-leak', 'owner 1 clean', 'stranger 1 clean'])
})

test('fix loop: a fix that does not hold is not pushed, and the loop fails', async () => {
  const p = project()
  setApi(p)
  const r = await loop(p, 'page-leak', { FAKE_CLAUDE_KANE_MODES: 'page-leak' })
  assert.equal(r.status, 1)
  const [s, md] = loopResult(p)
  assert.equal(s.after.verdict, 'LEAK')
  assert.equal(s.push, false)
  assert.match(md, /Nothing was committed: Stranger did not say CLEAN/)
})

test('fix loop: with the agent off (ALLOW_AGENT=false) it only checks', async () => {
  const p = project()
  setApi(p)
  const r = await loop(p, 'page-leak', { ALLOW_AGENT: 'false' })
  assert.equal(r.status, 1)
  const [s, md] = loopResult(p)
  assert.equal(s.agent.ran, false)
  assert.equal(existsSync(join(p.root, 'migrations', '0002_fix.sql')), false)
  assert.match(md, /The coding agent did not run/)
})

test('fix loop: a clean branch needs no agent', async () => {
  const p = project()
  setApi(p)
  const r = await loop(p, 'clean')
  assert.equal(r.status, 0)
  const [s, md] = loopResult(p)
  assert.equal(s.agent.ran, false)
  assert.match(md, /Nothing to fix\./)
})

test('report: rewrites report.md and FIX.md from the last run, with no Kane run and no new history line', async () => {
  const p = project()
  setApi(p)
  await run(p, 'page-leak')
  const before = calls(p).length
  writeFileSync(join(p.root, '.stranger', 'FIX.md'), 'stale')
  const r = await spawnAsync([BIN, 'report'], { cwd: p.root, env: env(p, 'clean') })
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /Rewrote .*report\.md and .*FIX\.md from run [0-9a-f]{6} \(LEAK\)/)
  assert.match(readFileSync(join(p.root, '.stranger', 'FIX.md'), 'utf8'), /# Stranger found a data leak/)
  assert.equal(calls(p).length, before, 'no Kane run')
  assert.equal(readFileSync(join(p.root, '.stranger', 'history.jsonl'), 'utf8').trim().split('\n').length, 1)
})

// ---------- Leak guards ----------
const ACCOUNTS = { 'maya@duebook.demo': { password: PASSWORD, user: 'owner' }, 'stranger@duebook.demo': { password: PASSWORD, user: 'stranger' } }

async function guard(p, args = [], modes = 'clean', extra = {}) {
  const r = await spawnAsync([BIN, 'guard', '--json', ...args], { cwd: p.root, env: env(p, modes, { SUPABASE_URL: API, SUPABASE_ANON_KEY: 'public-anon-key', ...extra }) })
  let out = null
  try {
    out = JSON.parse(r.stdout.trim().split('\n').at(-1))
  } catch {}
  return { code: r.status, out, stderr: r.stderr }
}
const guardsFile = (p) => JSON.parse(readFileSync(join(p.root, '.stranger', 'guards.json'), 'utf8'))

test('guards: account ids in a leaking read become {owner} and {stranger}, and the public key is dropped', async () => {
  const { guardPath } = await import('../src/guards.js')
  assert.equal(guardPath('https://x.supabase.co/rest/v1/invoices?apikey=k&select=*&user_id=eq.0b7c-11aa', { owner: '0b7c-11aa' }), '/rest/v1/invoices?select=*&user_id=eq.{owner}')
  assert.equal(guardPath('https://x.supabase.co/rest/v1/rpc/my_invoices', {}), '/rest/v1/rpc/my_invoices')
  assert.equal(guardPath('https://x.supabase.co/storage/v1/object/public/a/b', {}), null)
})

test('guards: a leak Kane found becomes a guard that says BROKEN while open, HOLDS once fixed, and reopens if it comes back', async () => {
  const p = project()
  setApi(p, { stranger: 'all', anon: 'all', accounts: ACCOUNTS })
  const none = await guard(p)
  assert.equal(none.code, 0)
  assert.equal(none.out.verdict, 'NONE')

  const r = await run(p, 'page-leak')
  assert.equal(r.out.verdict, 'LEAK')
  assert.deepEqual(r.out.guards, { added: 1, reopened: 0, kane: 1 })
  const file = readFileSync(join(p.root, '.stranger', 'guards.json'), 'utf8')
  const [g] = guardsFile(p).guards
  assert.equal(g.path, '/rest/v1/invoices?select=*&order=created_at.desc')
  assert.deepEqual(g.logins.sort(), ['anonymous', 'stranger'])
  assert.equal(g.state, 'open')
  for (const secret of [PASSWORD, 'Bearer', 'public-anon-key', 'Synthetic HAR Client']) assert.ok(!file.includes(secret), `guards.json holds ${secret}`)

  const open = await guard(p)
  assert.equal(open.code, 1)
  assert.equal(open.out.verdict, 'BROKEN')
  const tries = Object.fromEntries(open.out.guards[0].tries.map((t) => [t.as, t.ownerRows]))
  assert.deepEqual(tries, { stranger: 1, anonymous: 1 })
  assert.ok(!JSON.stringify(open.out).includes('stranger-canary-'), 'row values must not be printed')

  Object.assign(api, { stranger: 'own', anon: 'refuse' })
  const fixed = await guard(p)
  assert.equal(fixed.code, 0)
  assert.equal(fixed.out.verdict, 'HOLDS')
  assert.equal(guardsFile(p).guards[0].state, 'fixed')

  api.stranger = 'all'
  const back = await guard(p)
  assert.equal(back.code, 1)
  assert.equal(guardsFile(p).guards[0].state, 'open')
  assert.ok(guardsFile(p).guards[0].reopened)
})

test('guards: an owner with no rows of their own cannot be compared, so the guard cannot tell', async () => {
  const p = project()
  setApi(p, { stranger: 'all', anon: 'refuse', accounts: ACCOUNTS })
  await run(p, 'page-leak')
  api.rows = api.rows.filter((row) => row.user_id !== 'owner')
  const r = await guard(p)
  assert.equal(r.code, 2)
  assert.equal(r.out.guards[0].status, 'UNKNOWN')
})

test('guards: --record turns an older run into guards with no Kane run', async () => {
  const p = project({ options: { guards: false } })
  setApi(p, { stranger: 'all', anon: 'all', accounts: ACCOUNTS })
  await run(p, 'page-leak')
  assert.ok(!existsSync(join(p.root, '.stranger', 'guards.json')))
  const before = calls(p).length
  const r = await guard(p, ['--record'])
  assert.equal(r.out.verdict, 'BROKEN')
  assert.equal(guardsFile(p).guards.length, 1)
  assert.equal(calls(p).length, before, 'no Kane run')
})

test('Kane guards: replayed with kane-cli testrun and a verdict policy; logins stay off argv and off disk; planted rows are deleted', async () => {
  const p = project()
  setApi(p, { stranger: 'all', anon: 'refuse', accounts: ACCOUNTS })
  await run(p, 'page-leak')
  const dir = join(p.root, '.stranger', 'guards', 'kane')
  const test = readFileSync(join(dir, 'main_test.md'), 'utf8')
  assert.match(test, /^---\nmode: testing\nurl: http:\/\/localhost:5231\/duebook\//)
  assert.match(test, /\{\{owner_password\}\}/)
  assert.ok(!test.includes(PASSWORD))
  const { canary } = guardsFile(p).kane[0]

  Object.assign(api, { stranger: 'own' })
  const ok = await guard(p, ['--kane'], 'clean')
  assert.equal(ok.code, 0, ok.stderr)
  assert.equal(ok.out.kane.results[0].status, 'HOLDS')
  const args = readFileSync(join(p.kane, 'testrun-args.log'), 'utf8')
  for (const flag of ['testrun run main_test.md', '--agent', '--stream-members', '--policy stranger-guard.policy.yaml', '--override-start-url http://localhost:5231/duebook/']) assert.ok(args.includes(flag), `missing ${flag}`)
  assert.ok(existsSync(join(dir, 'stranger-guard.policy.yaml')))
  assert.ok(!existsSync(join(dir, '.testmuai', 'variables', 'stranger-guard.json')), 'the logins file is deleted after the run')
  assert.ok(!api.rows.some((row) => row.note === canary), "the guard's canary row is deleted again")
  assert.equal(guardsFile(p).kane[0].state, 'fixed')

  const broke = await guard(p, ['--kane'], 'page-leak')
  assert.equal(broke.code, 1)
  assert.equal(broke.out.kane.results[0].status, 'BROKEN')

  const unsure = await guard(p, ['--kane'], 'control-missing')
  assert.equal(unsure.out.kane.results[0].status, 'UNKNOWN')

  const careless = await spawnAsync([BIN, 'guard', '--kane'], { cwd: p.root, env: env(p, 'clean', { SUPABASE_URL: API, SUPABASE_ANON_KEY: 'public-anon-key', FAKE_KANE_LEAK_SECRET: '1' }) })
  assert.match(careless.stderr, /recordings hold a password/)
})

test('fix loop: once the fix holds, the leak guards run on the fixed database and the comment says so', async () => {
  const p = project()
  setApi(p, { stranger: 'all', anon: 'all', accounts: ACCOUNTS })
  // The stand-in database stops leaking the moment the agent's migration lands.
  const fix = join(p.root, 'migrations', '0002_fix.sql')
  const watch = setInterval(() => existsSync(fix) && Object.assign(api, { stranger: 'own', anon: 'refuse' }), 10)
  const r = await loop(p, 'page-leak', { SUPABASE_URL: API, SUPABASE_ANON_KEY: 'public-anon-key' })
  clearInterval(watch)
  assert.equal(r.status, 0, r.stderr)
  const [s, md] = loopResult(p)
  assert.equal(s.after.verdict, 'CLEAN')
  assert.deepEqual(s.guards, { verdict: 'HOLDS', total: 1, holds: 1, broken: 0 })
  assert.match(md, /\*\*Leak guards: ✅ 1 of 1 hold\.\*\*/)
  assert.equal(guardsFile(p).guards[0].state, 'fixed')
})
