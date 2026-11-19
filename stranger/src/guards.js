import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { call, signIn, subjectOf, OWNER_COLUMNS } from './api.js'
import { readPolicies } from './policies.js'
import { runKaneSuite } from './kane.js'

// Leak guards: every leak Kane finds becomes a check that keeps it found.
//
// - API guards (.stranger/guards.json): the reads that handed the owner's records to the stranger, or to
//   anyone with no login, with account ids swapped for {owner} and {stranger}. "stranger guard" signs both
//   accounts in again, sends each read as the owner, as the stranger and with no login, and counts the
//   owner's rows in the other two answers. No Kane run, no credits, a few seconds. Rows are compared in
//   memory and only counts are kept.
// - Kane guards (.stranger/guards/kane/*_test.md): the probe as a Kane test file, both accounts in one test.
//   Kane authors it on the first run, then replays the recorded steps (no LLM, far fewer credits) and heals
//   them if the page changes. "stranger guard --kane" runs them all with kane-cli testrun as one execution
//   with one sealed evidence pack, judged by a Kane verdict policy.

const FILE = 'guards.json'
const KANE_DIR = join('guards', 'kane')
const POLICY = 'stranger-guard.policy.yaml'
const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 6)
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'main'

// A read's address after the Supabase project URL, with the accounts' ids as {owner} and {stranger}, so the
// guard works on any environment and with fresh logins. The public key never goes in.
export function guardPath(url, subs = {}) {
  let u
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (!/^\/rest\/v1\/[A-Za-z0-9_]+(\/[A-Za-z0-9_]+)?\/?$/.test(u.pathname)) return null
  let search = u.search.replace(/([?&])apikey=[^&]*(&|$)/, (_, a, b) => (b ? a : '')).replace(/[?&]$/, '')
  for (const [name, sub] of Object.entries(subs)) {
    if (sub) search = search.replace(new RegExp(`(?<![\\w-])${escape(sub)}(?![\\w-])`, 'g'), `{${name}}`)
  }
  return u.pathname + search
}

const tableOf = (path) => path.match(/^\/rest\/v1\/(?:rpc\/)?([A-Za-z0-9_]+)/)?.[1] ?? null
const fill = (path, subs) => path.replace(/\{(owner|stranger)\}/g, (_, k) => encodeURIComponent(subs[k] ?? ''))

// The reads that leaked in one probe: replayed reads that returned the owner's canary.
export function guardCandidates(replay, subs = {}) {
  const out = []
  for (const r of replay ?? []) {
    if (!r.hit || r.skipped || !r.as) continue
    const path = guardPath(r.url, subs)
    if (path) out.push({ method: r.method ?? 'GET', path, as: r.as })
  }
  return out
}

export function loadGuards(cfg) {
  const file = join(cfg.root, '.stranger', FILE)
  const data = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
  return { file, data: { guards: data.guards ?? [], kane: data.kane ?? [] } }
}

function saveGuards(file, data) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n')
}

// After a Stranger run: every leaking read becomes an API guard, and every probe where Kane saw the owner's
// canary on the stranger's page becomes a Kane guard. A guard that held before and leaks again is reopened.
export function recordGuards(cfg, result) {
  const { file, data } = loadGuards(cfg)
  const out = { added: [], reopened: [], kane: [] }
  let changed = false
  const stamp = (p) => ({ run: result.id, at: result.startedAt, kane: p.strangerRun?.testUrl ?? null })
  for (const p of result.probes ?? []) {
    for (const c of p.api?.guards ?? guardCandidates(p.replay)) {
      const table = tableOf(c.path)
      const id = `${table}-${hash(`${c.method} ${c.path}`)}`
      let g = data.guards.find((x) => x.id === id)
      if (!g) {
        g = { id, table, method: c.method, path: c.path, logins: [], probe: p.probe, found: stamp(p), state: 'open' }
        data.guards.push(g)
        out.added.push(g)
        changed = true
      } else if (g.state === 'fixed' && !out.reopened.includes(g)) {
        Object.assign(g, { state: 'open', reopened: stamp(p) })
        out.reopened.push(g)
        changed = true
      }
      if (!g.logins.includes(c.as)) {
        g.logins.push(c.as)
        changed = true
      }
    }
    if (cfg.kaneGuards !== false && p.verdict === 'LEAK' && p.seen === 'page' && !data.kane.some((k) => k.probe === p.probe)) {
      const k = writeKaneGuard(cfg, p, stamp(p))
      data.kane.push(k)
      out.kane.push(k)
      changed = true
    }
  }
  if (changed) saveGuards(file, data)
  return out
}

// ---------- API guards ----------

// The Supabase project the guards talk to: from the config, else the app's own environment variables.
export function guardTarget(cfg) {
  return cfg.supabaseUrl && cfg.supabaseAnonKey ? { base: cfg.supabaseUrl.replace(/\/$/, ''), apikey: cfg.supabaseAnonKey } : null
}

const fingerprint = (row) =>
  row && typeof row === 'object' && row.id != null ? `id:${row.id}` : JSON.stringify(row, Object.keys(row ?? {}).sort())

// Sends every guard's read as the owner, the stranger and with no login. BROKEN: the stranger or a request
// with no login got any of the owner's rows. HOLDS: neither did. UNKNOWN: the owner has nothing in that read
// yet (so there is nothing to compare), or a request failed.
export async function checkGuards(cfg, guards) {
  const target = guardTarget(cfg)
  if (!target) throw new Error('guards need the Supabase URL and public key: set SUPABASE_URL and SUPABASE_ANON_KEY (or VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY) in .env, or "supabaseUrl" and "supabaseAnonKey" in the config')
  const owner = await signIn(target, cfg.owner.email, cfg.owner.password)
  if (!owner) throw new Error(`could not sign in as ${cfg.owner.email}`)
  const stranger = await signIn(target, cfg.stranger.email, cfg.stranger.password)
  if (!stranger) throw new Error(`could not sign in as ${cfg.stranger.email}`)
  const subs = { owner: subjectOf(owner), stranger: subjectOf(stranger) }
  const dir = cfg.migrations ? join(cfg.root, cfg.migrations) : null
  const base = { apikey: target.apikey, 'accept-profile': 'public', 'content-profile': 'public' }

  const results = []
  for (const g of guards) {
    const url = target.base + fill(g.path, subs)
    const body = g.method === 'POST' ? {} : undefined
    const out = { id: g.id, table: g.table, method: g.method, path: g.path, logins: g.logins, tries: [] }
    const mine = await call(g.method, url, { ...base, ...owner }, body)
    if (!mine.ok || !Array.isArray(mine.json)) {
      results.push({ ...out, status: 'UNKNOWN', why: `the owner's own read failed (${mine.status ?? mine.error})` })
      continue
    }
    if (!mine.json.length) {
      results.push({ ...out, status: 'UNKNOWN', why: 'the owner has no rows in this read yet, so there is nothing to compare' })
      continue
    }
    const ownerColumn = readPolicies(dir, g.table).ownerColumn ?? OWNER_COLUMNS.find((c) => mine.json[0] && Object.hasOwn(mine.json[0], c)) ?? null
    // With an owner column in every row, only the owner's own rows count (a leaky table shows the owner
    // everyone's). Without one, everything the owner reads does.
    const owned = ownerColumn && mine.json.every((row) => row && Object.hasOwn(row, ownerColumn)) ? mine.json.filter((row) => String(row[ownerColumn]) === subs.owner) : mine.json
    if (!owned.length) {
      results.push({ ...out, status: 'UNKNOWN', why: 'the owner has no rows of their own in this read yet, so there is nothing to compare' })
      continue
    }
    const prints = new Set(owned.map(fingerprint))
    for (const [as, login] of [['stranger', stranger], ['anonymous', {}]]) {
      const r = await call(g.method, url, { ...base, ...login }, body)
      const rows = r.ok && Array.isArray(r.json) ? r.json : []
      // The stranger's own rows don't count, even if the owner can see them.
      const theirs = rows.filter((row) => prints.has(fingerprint(row)) && !(as === 'stranger' && ownerColumn && subs.stranger && String(row?.[ownerColumn]) === subs.stranger))
      out.tries.push({ as, status: r.status ?? null, rows: rows.length, ownerRows: theirs.length, ...(r.error ? { error: r.error } : {}) })
    }
    const broken = out.tries.filter((t) => t.ownerRows > 0)
    const failed = out.tries.find((t) => t.error)
    results.push({
      ...out,
      ownerRows: owned.length,
      status: broken.length ? 'BROKEN' : failed ? 'UNKNOWN' : 'HOLDS',
      why: broken.length
        ? broken.map((t) => `${t.as === 'stranger' ? 'the stranger' : 'a request with no login'} got ${t.ownerRows} of the owner's ${owned.length} rows`).join('; ')
        : failed
          ? `a request failed (${failed.error})`
          : `the owner has ${owned.length} ${owned.length === 1 ? 'row' : 'rows'} here; the stranger and a request with no login get none of them`,
    })
  }
  return results
}

// Guard states move with each check: an open guard that holds is fixed, a fixed one that breaks is reopened.
export function updateStates(cfg, results, kane = []) {
  const { file, data } = loadGuards(cfg)
  const at = new Date().toISOString()
  let changed = false
  const move = (g, status) => {
    if (status === 'HOLDS' && g.state !== 'fixed') {
      Object.assign(g, { state: 'fixed', fixed: { at } })
      changed = true
    } else if (status === 'BROKEN' && g.state === 'fixed') {
      Object.assign(g, { state: 'open', reopened: { at, by: 'guard' } })
      changed = true
    }
  }
  for (const r of results) {
    const g = data.guards.find((x) => x.id === r.id)
    if (g) move(g, r.status)
  }
  for (const r of kane) {
    const k = data.kane.find((x) => x.file === r.file)
    if (k) move(k, r.status)
  }
  if (changed) saveGuards(file, data)
  return data
}

// ---------- Kane guards ----------

// Stable per probe: a test file's text must not change between runs, or Kane authors it again.
export function kaneMarks(probe) {
  const h = hash(`stranger-guard:${probe}`)
  return { canary: `stranger-guard-${h}`, control: `stranger-own-${h}` }
}

function writeKaneGuard(cfg, p, found) {
  const dir = join(cfg.root, '.stranger', KANE_DIR)
  mkdirSync(dir, { recursive: true })
  const { canary, control } = kaneMarks(p.probe)
  const probe = (cfg.probes ?? []).find((x) => x.name === p.probe) ?? { plant: cfg.plant, look: cfg.look }
  const file = `${slug(p.probe)}_test.md`
  // Kane's own words for the accounts are variables, filled at run time from a file that is deleted after.
  const text = [
    '---',
    'mode: testing',
    `url: ${cfg.url}`,
    'max_steps: 60',
    'tags: [stranger, guard]',
    '---',
    '',
    `# Stranger guard: ${p.probe}`,
    '',
    `Kane found this leak in Stranger run ${found.run}: the stranger saw the owner's record on their own page. This test repeats the check with both accounts. It must keep passing.`,
    '',
    "## The owner saves a record only they should see",
    `Log in with the email {{owner_email}} and the password {{owner_password}} using the email form. Then ${probe.plant}. The text to type is exactly: ${canary} . Save it. Verify that the text "${canary}" is visible on the page.`,
    '',
    '## The owner logs out',
    'Log out of the app. Verify that the email form is visible again.',
    '',
    '## The stranger saves a record of their own',
    `Log in with the email {{stranger_email}} and the password {{stranger_password}} using the email form. Then ${probe.plant}. The text to type is exactly: ${control} . Save it.`,
    '',
    "## The stranger does not see the owner's record",
    `Open ${probe.look}. Verify that the text "${control}" is visible on the page. Then verify that the text "${canary}" does not appear anywhere on the page.`,
    '',
  ].join('\n')
  if (!existsSync(join(dir, file))) writeFileSync(join(dir, file), text)
  writePolicy(dir)
  return { probe: p.probe, file, canary, control, row: p.api?.row ?? null, found, state: 'open' }
}

// A Kane verdict policy for the guard run's sealed evidence pack.
function writePolicy(dir) {
  const file = join(dir, POLICY)
  if (existsSync(file)) return file
  writeFileSync(
    file,
    [
      'policy: stranger-guard',
      'gates:',
      '  - id: no-leak-came-back',
      '    metric: totals.failed',
      '    equals: 0',
      '    severity: blocking',
      "    message: A leak Kane found before is back. The stranger can see the owner's record again.",
      '  - id: no-guard-broke-down',
      '    metric: totals.broken',
      '    equals: 0',
      '    severity: blocking',
      '    message: A guard could not finish, so it proves nothing this time.',
      '  - id: replayed-not-rewritten',
      '    metric: metrics.heal.exhausted_tests',
      '    equals: 0',
      '    severity: warning',
      '    message: The page changed so much that Kane had to write a guard again from scratch.',
      '',
    ].join('\n'),
  )
  return file
}

// Every file under the guard folder that holds one of the given values (a password), for the warning
// before anyone commits Kane's recordings.
function filesHolding(dir, values) {
  const hits = []
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      if (name === '.testmuai') continue
      const p = join(d, name)
      const st = statSync(p)
      if (st.isDirectory()) walk(p)
      else if (st.size < 5_000_000 && values.some((v) => v && readFileSync(p, 'utf8').includes(v))) hits.push(relative(dir, p))
    }
  }
  if (existsSync(dir)) walk(dir)
  return hits
}

// Runs every Kane guard with kane-cli testrun. Each one plants its own canary and control, so both rows
// are deleted again through the API afterwards when the run recorded where they live.
export async function runKaneGuards(cfg, { headless = true, onEvent } = {}) {
  const { data } = loadGuards(cfg)
  const dir = join(cfg.root, '.stranger', KANE_DIR)
  const members = data.kane.filter((k) => existsSync(join(dir, k.file)))
  if (!members.length) return null
  writePolicy(dir)

  // kane-cli testrun has no --variables, so the logins go into Kane's variables folder for this directory
  // (.testmuai/ is gitignored), readable only by this user, and are deleted as soon as the run ends.
  const varsDir = join(dir, '.testmuai', 'variables')
  mkdirSync(varsDir, { recursive: true })
  const varsFile = join(varsDir, 'stranger-guard.json')
  writeFileSync(
    varsFile,
    JSON.stringify({
      owner_email: { value: cfg.owner.email },
      owner_password: { value: cfg.owner.password, secret: true },
      stranger_email: { value: cfg.stranger.email },
      stranger_password: { value: cfg.stranger.password, secret: true },
    }),
    { mode: 0o600 },
  )
  const logDir = join(cfg.root, '.stranger', 'runs')
  mkdirSync(logDir, { recursive: true })
  const logFile = join(logDir, `guard-${new Date().toISOString().replace(/[:.]/g, '-')}.ndjson`)
  let run
  try {
    run = await runKaneSuite({
      cwd: dir,
      paths: members.map((m) => m.file),
      policy: POLICY,
      headless,
      startUrl: cfg.url,
      timeout: cfg.timeout * members.length * 2,
      logFile,
      onEvent,
    })
  } finally {
    rmSync(varsFile, { force: true })
  }

  const results = members.map((m) => {
    const failed = run.failures.filter((f) => f.text.includes(m.canary) || f.text.includes(m.control) || f.member?.includes(m.file.replace(/_test\.md$/, '')))
    const text = failed.map((f) => f.text).join(' ')
    const status = run.exitCode === 0 ? 'HOLDS' : text.includes(m.canary) && !text.includes(m.control) ? 'BROKEN' : 'UNKNOWN'
    return {
      probe: m.probe,
      file: m.file,
      status,
      why:
        status === 'HOLDS'
          ? "Kane replayed both accounts: the stranger saw their own record and not the owner's."
          : status === 'BROKEN'
            ? "Kane saw the owner's record on the stranger's page again."
            : text.includes(m.control)
              ? 'The stranger could not see their own record, so the check means nothing this time.'
              : `Kane did not finish: ${text || run.reason || `exit ${run.exitCode}`}`,
    }
  })

  // Clean up the rows each guard planted.
  const cleaned = await cleanUp(cfg, members)
  const secrets = filesHolding(dir, [cfg.owner.password, cfg.stranger.password])
  return { exitCode: run.exitCode, results, policy: run.policy, testUrl: run.testUrl, credits: run.credits, seconds: run.seconds, pack: run.pack, logFile, cleaned, secrets }
}

async function cleanUp(cfg, members) {
  const target = guardTarget(cfg)
  const withRow = members.filter((m) => m.row?.table && m.row?.field)
  if (!target || !withRow.length) return null
  const owner = await signIn(target, cfg.owner.email, cfg.owner.password)
  const stranger = await signIn(target, cfg.stranger.email, cfg.stranger.password)
  let ok = true
  for (const m of withRow) {
    const url = (mark) => `${target.base}/rest/v1/${m.row.table}?${encodeURIComponent(m.row.field)}=eq.${encodeURIComponent(mark)}`
    for (const [login, mark] of [[owner, m.canary], [stranger, m.control]]) {
      if (!login) {
        ok = false
        continue
      }
      const r = await call('DELETE', url(mark), { apikey: target.apikey, ...login })
      ok &&= !!r.ok
    }
  }
  return ok
}
