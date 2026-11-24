import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

const JWT = /eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}/
const LOCAL_USER_PATH = /(?:\/Users\/|\/home\/|C:\\Users\\)[^\s)"'`<>]+/
const VERDICTS = new Set(['LEAK', 'TAMPER', 'OVERLOCKED', 'CLEAN', 'INCONCLUSIVE'])
const SITE = 'https://stranger-2yf3.vercel.app'

// Fallback snapshot for `npx github:Sanchay117/stranger demo` when run outside a clone of this repo.
// Every number comes from the real committed runs verified by `stranger verify`.
const SNAPSHOT = {
  bench: {
    date: '19 Nov 2026',
    credits: 589,
    cases: [
      ['rls_off', 'LEAK', 'on the page'],
      ['client_filter', 'LEAK', 'API replay'],
      ['leaky_view', 'LEAK', 'API replay'],
      ['leaky_rpc', 'LEAK', 'no-login replay'],
      ['detail_page', 'LEAK', 'direct link'],
      ['forged_insert', 'TAMPER', 'forged owner'],
      ['leaky_total', 'LEAK', 'numeric canary'],
      ['storage_leak', 'LEAK', 'files'],
      ['broadcast_leak', 'LEAK', 'live updates'],
      ['all_good', 'CLEAN', 'clean control'],
    ],
  },
  guardRestyle: { credits: 9.28, replayed: 3, authored: 1, verdict: 'BROKEN' },
}

const HOW = {
  page: 'on the page',
  network: 'API replay',
  anonymous: 'no-login replay',
  'direct-link': 'direct link',
  forged: 'forged owner',
  aggregate: 'numeric canary',
  storage: 'files',
  realtime: 'live updates',
}

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex')
}

function loadEnvSecrets(root) {
  const secrets = []
  const file = join(root, '.env')
  if (!existsSync(file)) return secrets
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = /^\s*[A-Z0-9_]*(PASSWORD|SECRET|TOKEN|KEY)\s*=\s*(.+)$/.exec(line)
    const v = m?.[2].trim().replace(/^["']|["']$/g, '')
    // Public demo account passwords and Supabase anon keys are intentionally client-side.
    if (!v || v.length < 8) continue
    if (/^\s*(OWNER_|STRANGER_|VITE_)/.test(line)) continue
    secrets.push(v)
  }
  return secrets
}

function scanClean(text, rel, secrets, errors, { checkLocalPaths = false } = {}) {
  if (JWT.test(text)) errors.push(`${rel}: contains a JWT`)
  if (secrets.some((s) => text.includes(s))) errors.push(`${rel}: contains a secret from .env`)
  if (checkLocalPaths && LOCAL_USER_PATH.test(text)) errors.push(`${rel}: contains a local user directory path`)
}

function parseJsonl(file, rel, errors) {
  const rows = []
  const lines = readFileSync(file, 'utf8').split('\n').filter((l) => l.trim())
  for (let i = 0; i < lines.length; i++) {
    try {
      rows.push(JSON.parse(lines[i]))
    } catch (err) {
      errors.push(`${rel}:${i + 1}: invalid JSON (${err.message})`)
    }
  }
  return rows
}

function walkFiles(dir, ext) {
  const out = []
  if (!existsSync(dir)) return out
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...walkFiles(p, ext))
    else if (!ext || e.name.endsWith(ext)) out.push(p)
  }
  return out.sort()
}

// Verifies committed Stranger evidence in a repo:
// - .stranger/ history, reports and guards (valid JSONL, zero leaked JWTs or secrets)
// - when run inside the Stranger repo: cross-checks demo/bench/results.json against bench/cases/,
//   verifies every saved run page and screenshot under demo/public/runs/, and checks any field/ docs.
export async function verifyEvidence(root = process.cwd()) {
  const errors = []
  const secrets = loadEnvSecrets(root)
  const digestHash = createHash('sha256')
  let hashedFiles = 0

  const addFile = (file, opts) => {
    const rel = relative(root, file)
    const buf = readFileSync(file)
    digestHash.update(`${rel}\0`).update(buf).update('\0')
    hashedFiles++
    if (!/\.(jpg|jpeg|png|webp)$/i.test(file)) scanClean(buf.toString('utf8'), rel, secrets, errors, opts)
    return buf.toString('utf8')
  }

  // 1. .stranger/ tracked evidence
  const history = { runs: 0, verdicts: {}, credits: 0 }
  const historyFile = join(root, '.stranger', 'history.jsonl')
  if (existsSync(historyFile)) {
    addFile(historyFile)
    for (const r of parseJsonl(historyFile, '.stranger/history.jsonl', errors)) {
      if (!r.id || !r.at || !VERDICTS.has(r.verdict)) {
        errors.push(`.stranger/history.jsonl: entry missing valid id/at/verdict (${r.id ?? '?'})`)
        continue
      }
      history.runs++
      history.verdictLast = r.verdict
      history.verdicts[r.verdict] = (history.verdicts[r.verdict] ?? 0) + 1
      if (typeof r.credits === 'number') history.credits += r.credits
    }
  }
  for (const name of ['report.md', 'FIX.md', 'guards.json']) {
    const f = join(root, '.stranger', name)
    if (existsSync(f)) addFile(f)
  }
  for (const f of walkFiles(join(root, '.stranger', 'guards', 'kane'), '.md')) addFile(f)

  // 2. Guard history
  const guards = { runs: 0, replayedTotal: 0, credits: 0, last: null }
  const guardFile = join(root, '.stranger', 'guards', 'history.jsonl')
  if (existsSync(guardFile)) {
    addFile(guardFile)
    for (const r of parseJsonl(guardFile, '.stranger/guards/history.jsonl', errors)) {
      guards.runs++
      guards.last = r
      for (const k of r.kane?.results ?? []) guards.replayedTotal += Number(k.replayed ?? 0)
      if (typeof r.kane?.credits === 'number') guards.credits += r.kane.credits
    }
  }

  // 3. Bench scorecard cross-check (present in the Stranger repo)
  let bench = null
  const resultsFile = join(root, 'demo', 'bench', 'results.json')
  const casesFile = join(root, 'demo', 'bench', 'cases.js')
  if (existsSync(resultsFile) && existsSync(casesFile)) {
    const results = JSON.parse(addFile(resultsFile))
    const { CASES, caught } = await import(pathToFileURL(casesFile).href)
    const byId = Object.fromEntries((results.cases ?? []).map((c) => [c.id, c]))
    let bugsTotal = 0
    let bugsCaught = 0
    let controlClean = null
    let creditSum = 0
    const rows = []

    for (const spec of CASES) {
      const r = byId[spec.id]
      const isControl = spec.expect.verdict === 'CLEAN'
      if (!isControl) bugsTotal++
      if (!r) {
        errors.push(`bench: missing case "${spec.id}" in demo/bench/results.json`)
        continue
      }
      const ok = caught(spec, r)
      if (isControl) controlClean = ok === true
      else if (ok) bugsCaught++
      else errors.push(`bench: case "${spec.id}" expected ${spec.expect.verdict}, got ${r.verdict}`)

      if (typeof r.credits === 'number') creditSum += r.credits
      rows.push({ id: spec.id, verdict: r.verdict, seen: r.seen, how: r.seen ? HOW[r.seen] ?? r.seen : 'clean control', caught: ok, saved: r.saved ?? null, credits: r.credits })

      const caseDir = join(root, 'bench', 'cases', spec.id, '.stranger')
      const reportFile = join(caseDir, 'report.md')
      const histFile = join(caseDir, 'history.jsonl')
      const fixFile = join(caseDir, 'FIX.md')
      if (!existsSync(reportFile)) {
        errors.push(`bench: missing ${relative(root, reportFile)}`)
      } else {
        const md = addFile(reportFile)
        const head = md.split('\n')[0]?.trim()
        if (head !== `# Stranger: ${r.verdict}`) {
          errors.push(`bench/${spec.id}: report heading "${head}" does not match results.json verdict "${r.verdict}"`)
        }
        if (r.canary && !md.includes(r.canary)) {
          errors.push(`bench/${spec.id}: report.md does not mention canary ${r.canary}`)
        }
      }
      if (!existsSync(histFile)) {
        errors.push(`bench: missing ${relative(root, histFile)}`)
      } else {
        addFile(histFile)
        const hrows = parseJsonl(histFile, relative(root, histFile), errors)
        if (!hrows.some((h) => h.verdict === r.verdict && h.strangerRun === r.strangerRun)) {
          errors.push(`bench/${spec.id}: history.jsonl has no run matching results.json`)
        }
      }
      if (r.verdict !== 'CLEAN') {
        if (!existsSync(fixFile)) errors.push(`bench: missing ${relative(root, fixFile)}`)
        else addFile(fixFile)
      }
      if (r.saved) {
        const slug = r.saved.replace(/^\/runs\/|\/$/g, '')
        const savedHtml = join(root, 'demo', 'public', 'runs', slug, 'index.html')
        if (!existsSync(savedHtml)) errors.push(`bench/${spec.id}: saved run "${r.saved}" missing at ${relative(root, savedHtml)}`)
      }
    }

    if (Math.abs(creditSum - (results.credits ?? 0)) > 1) {
      errors.push(`bench: results.json credits (${results.credits}) does not match sum of cases (${creditSum.toFixed(1)})`)
    }
    bench = {
      cases: CASES.length,
      bugsCaught,
      bugsTotal,
      controlClean,
      credits: Math.round(creditSum),
      saved: rows.filter((r) => r.saved).length,
      at: results.at,
      rows,
    }
  }

  // 4. Saved Kane run pages under demo/public/runs/
  let savedRuns = null
  const runsDir = join(root, 'demo', 'public', 'runs')
  if (existsSync(runsDir)) {
    const dirs = readdirSync(runsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()
    let screenshots = 0
    const pages = []
    for (const id of dirs) {
      const htmlPath = join(runsDir, id, 'index.html')
      if (!existsSync(htmlPath)) {
        errors.push(`demo/public/runs/${id}: missing index.html`)
        continue
      }
      const html = addFile(htmlPath, { checkLocalPaths: true })
      const imgs = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1])
      if (!imgs.length) errors.push(`demo/public/runs/${id}: index.html has no screenshots`)
      for (const img of imgs) {
        const p = join(runsDir, id, img)
        if (!existsSync(p) || statSync(p).size === 0) {
          errors.push(`demo/public/runs/${id}: missing or empty screenshot ${img}`)
        } else {
          screenshots++
        }
      }
      const verdict = /class="verdict\s+([A-Z]+)"/.exec(html)?.[1] ?? null
      pages.push({ id, verdict, screenshots: imgs.length })
    }
    savedRuns = { count: pages.length, screenshots, pages }
  }

  // 5. Optional field-test reports under field/ (checked if present)
  let field = null
  const fieldDir = join(root, 'field')
  if (existsSync(fieldDir)) {
    const docs = walkFiles(fieldDir, '.md')
    const runLinks = new Set()
    for (const doc of docs) {
      const text = addFile(doc, { checkLocalPaths: true })
      for (const m of text.matchAll(/\/runs\/([A-Za-z0-9_-]+)\//g)) {
        runLinks.add(m[1])
        const target = join(root, 'demo', 'public', 'runs', m[1], 'index.html')
        if (!existsSync(target)) errors.push(`${relative(root, doc)}: links to /runs/${m[1]}/ which does not exist`)
      }
    }
    field = { docs: docs.length, linkedRuns: [...runLinks].sort() }
  }

  const hasAny = history.runs > 0 || guards.runs > 0 || bench !== null || savedRuns !== null
  if (!hasAny) {
    errors.push('no Stranger evidence found in this folder (run "stranger run" or run inside a clone of the Stranger repo)')
  }

  return {
    ok: errors.length === 0,
    hashedFiles,
    digest: sha256(digestHash.digest()).slice(0, 16),
    history,
    guards,
    bench,
    savedRuns,
    field,
    errors,
  }
}

// Formats a crisp, zero-network terminal walkthrough of Stranger's real evidence.
export async function renderDemo(root = process.cwd(), paint = {}) {
  const b = paint.bold ?? ((s) => s)
  const d = paint.dim ?? ((s) => s)
  const g = paint.green ?? ((s) => s)
  const r = paint.red ?? ((s) => s)
  const c = paint.yellow ?? ((s) => s)

  const inRepo = existsSync(join(root, 'demo', 'bench', 'results.json'))
  const verified = inRepo ? await verifyEvidence(root) : null
  const lines = []

  lines.push(`${b('Stranger')} ${d('· you only ever test your app as yourself. Stranger tests it as someone else.')}`)
  lines.push(`${d('Real committed Kane CLI evidence. No login, no network calls, no credits.')}`)
  lines.push('')
  lines.push(b('1. The problem (CVE-2025-48757)'))
  lines.push('   170 of 1,645 Lovable apps let any signed-in user read other users\' database rows.')
  lines.push('   You never see it when you only test as yourself. Stranger signs in as a second user.')
  lines.push('')
  lines.push(b('2. The closed loop on Duebook (branch agent-loop, 16 Nov 2026)'))
  lines.push('   A fresh Claude Code agent was asked only to add a search box. It was never told about the leak.')
  lines.push(`   ${r('LEAK')}   run f5b2cc  Stop hook ran Stranger before the agent could finish.`)
  lines.push(`          ${d('Maya planted stranger-canary-f5b2cc; stranger@duebook.demo saw it on the page.')}`)
  lines.push(`          ${d(`Saved Kane run: ${SITE}/runs/f5b2cc/`)}`)
  lines.push(`   ${c('FIX')}    .stranger/FIX.md named "Enable read access for all users" in 0001_invoices.sql`)
  lines.push(`          ${d('Agent wrote + applied 0002_invoices_owner_read.sql (commit 59c1942):')}`)
  lines.push(`          ${d('using ((select auth.uid()) = user_id)')}`)
  lines.push(`   ${g('CLEAN')}  run c789a7  Stop hook re-ran Stranger with a fresh canary. Zero leak.`)
  lines.push(`          ${d(`Saved Kane run: ${SITE}/runs/c789a7/`)}`)
  lines.push('')

  const benchRows = verified?.bench
    ? verified.bench.rows.map((x) => [x.id, x.verdict, x.how])
    : SNAPSHOT.bench.cases
  const caughtCount = verified?.bench ? `${verified.bench.bugsCaught} of ${verified.bench.bugsTotal}` : '9 of 9'
  const benchCredits = verified?.bench ? verified.bench.credits : SNAPSHOT.bench.credits

  lines.push(b(`3. The bench: ${caughtCount} real bug classes caught, clean control CLEAN (${benchCredits} Kane credits)`))
  for (const [id, verdict, how] of benchRows) {
    const tag = verdict === 'CLEAN' ? g(verdict.padEnd(6)) : r(verdict.padEnd(6))
    lines.push(`   ${tag} ${id.padEnd(16)} ${d(how)}`)
  }
  lines.push(`   ${d(`Scorecard and saved runs: ${SITE}/bench/`)}`)
  lines.push('')
  lines.push(b('4. Leak guards survive a full UI restyle'))
  const gr = SNAPSHOT.guardRestyle
  lines.push(`   ${r(gr.verdict)} main_test.md  ${gr.replayed} recorded steps replayed with zero healing (${gr.credits} credits).`)
  lines.push(`          ${d('Recorded on the old orange Duebook; caught the leak unchanged on the new design.')}`)
  lines.push('')

  if (verified) {
    const badge = verified.ok ? g('VERIFIED') : r('FAILED')
    lines.push(b('5. Evidence integrity (recomputed from this repo right now)'))
    lines.push(
      `   ${badge}  ${verified.hashedFiles} evidence files · ${verified.savedRuns?.count ?? 0} saved Kane pages (${verified.savedRuns?.screenshots ?? 0} screenshots) · sha256 ${verified.digest}`,
    )
    if (!verified.ok) for (const err of verified.errors) lines.push(`   ${r('✗')} ${err}`)
    lines.push('')
  }

  lines.push(b('See it live (one click, no sign-up)'))
  lines.push(`   Leaky Duebook as stranger: ${SITE}/duebook/?as=stranger`)
  lines.push(`   Product page and replay:   ${SITE}`)
  lines.push(`   Run on your own app:       npx --yes github:Sanchay117/stranger run`)

  return { text: lines.join('\n'), ok: verified ? verified.ok : true }
}
