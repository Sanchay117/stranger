// Saves a lasting copy of Stranger's Kane CLI runs as static pages at demo/public/runs/<id>/.
// Kane's share links expire after seven days, so the README, the site and the bench link here instead.
// Only Kane's own step summaries and screenshots leave the evidence pack. The network logs (login
// tokens) and test.md (variable values) are never unzipped.
//
//   node scripts/save-kane-runs.mjs <stranger run dir>...
//       a .stranger/runs/<run> folder: reads its result.json and .testmuai/evidence/*.evidence
//   node scripts/save-kane-runs.mjs --bench
//       every bench case whose two Kane sessions are on this machine (paths from
//       bench/cases/<id>/.stranger/report.md); saves /runs/bench-<id>/ and sets "saved" in
//       demo/bench/results.json so the scorecard links to it

import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(root, 'demo', 'public', 'runs')
const DOCS = 'https://www.testmuai.com/support/docs/kane-cli-tms-integration/'

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const mins = (s) => (s == null ? '' : s >= 60 ? `${Math.floor(s / 60)} min ${Math.round(s % 60)} s` : `${Math.round(s)} s`)
const roleOf = (name) => (name.includes('-owner-') ? 'owner' : name.includes('-probe-') ? 'stranger' : name)

// A .evidence file, or a folder that holds evidence/ or .testmuai/evidence/.
function packsIn(path) {
  if (path.endsWith('.evidence')) return existsSync(path) ? [path] : []
  for (const sub of ['.testmuai/evidence', 'evidence']) {
    const d = join(path, sub)
    if (existsSync(d)) return readdirSync(d).filter((f) => f.endsWith('.evidence')).map((f) => join(d, f))
  }
  return []
}

// Kane's steps for each test in the packs, with screenshots copied (and shrunk) into dest.
function saveSteps(packs, dest) {
  const tests = {}
  for (const pack of packs) {
    const tmp = mkdtempSync(join(tmpdir(), 'kane-save-'))
    try {
      spawnSync('unzip', ['-q', '-o', pack, 'tests/*/steps/*/step.json', 'tests/*/steps/*/screenshot.jpg', '-d', tmp])
      if (!existsSync(join(tmp, 'tests'))) continue
      for (const test of readdirSync(join(tmp, 'tests'))) {
        const name = test.replace(/-[0-9a-f]{8}$/, '')
        const role = roleOf(name)
        const sdir = join(tmp, 'tests', test, 'steps')
        if (!existsSync(sdir)) continue
        const steps = (tests[role] ??= { name, steps: [] }).steps
        for (const d of readdirSync(sdir)) {
          const file = join(sdir, d, 'step.json')
          if (!existsSync(file)) continue
          const info = JSON.parse(readFileSync(file, 'utf8'))
          const ordinal = Number(info.ordinal ?? d.split('-')[0])
          let shot = null
          const src = join(sdir, d, 'screenshot.jpg')
          if (existsSync(src)) {
            shot = `${role}-${ordinal}.jpg`
            const small = spawnSync('sips', ['-Z', '1200', '-s', 'formatOptions', '62', src, '--out', join(dest, shot)])
            if (small.status !== 0) copyFileSync(src, join(dest, shot))
          }
          steps.push({ ordinal, status: info.status ?? '', summary: info.summary ?? '', url: info.url ?? '', shot })
        }
        steps.sort((a, b) => a.ordinal - b.ordinal)
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  }
  return tests
}

function where(url) {
  try {
    const u = new URL(url)
    return u.host + (u.pathname === '/' ? '' : u.pathname) + u.search
  } catch {
    return url
  }
}

function page(m, tests) {
  const date = new Date(m.when).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  const order = [
    ['owner', `Kane signs in as ${m.owner} and plants the canary`],
    ['stranger', `Kane signs in as ${m.stranger} and looks for it`],
  ]
  const sections = order
    .filter(([role]) => tests[role])
    .map(([role, title], i) => {
      const t = tests[role]
      const run = m.runs[role] ?? {}
      const facts = [run.status, run.seconds != null ? `in ${mins(run.seconds)}` : '', run.credits != null ? `· ${Math.round(run.credits * 10) / 10} credits` : ''].filter(Boolean).join(' ')
      const steps = t.steps
        .map(
          (s) => `
      <li class="step ${s.status === 'passed' ? 'ok' : 'bad'}">
        ${s.shot ? `<a class="shot" href="${s.shot}" target="_blank" rel="noopener"><img src="${s.shot}" loading="lazy" width="1200" height="675" alt="Kane's screenshot after step ${s.ordinal}"></a>` : '<div class="shot none">No screenshot</div>'}
        <div class="cap">
          <div class="top"><span class="n">Step ${s.ordinal}</span><span class="st">${esc(s.status)}</span></div>
          <p>${esc(s.summary)}</p>
          ${s.url ? `<span class="url">${esc(where(s.url))}</span>` : ''}
        </div>
      </li>`,
        )
        .join('')
      return `
  <section>
    <h2><span class="num">${i + 1}</span>${esc(title)}</h2>
    <p class="meta">Kane test <code>${esc(t.name)}</code>${facts ? ` · ${esc(facts)}` : ''}</p>
    ${run.said ? `<p class="meta">Kane's summary: "${esc(run.said)}"</p>` : ''}
    ${run.shareUrl ? `<details><summary>Kane's original share link (expired)</summary><code>${esc(run.shareUrl)}</code></details>` : ''}
    <ol class="steps">${steps}
    </ol>
  </section>`
    })
    .join('')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kane run ${esc(m.id)} · Stranger</title>
<meta name="description" content="A saved copy of a real Kane CLI run from Stranger: Kane's own steps and screenshots.">
<script>
  try { var t = localStorage.getItem('stranger-theme') } catch (e) {}
  document.documentElement.dataset.theme = t === 'light' || t === 'dark' ? t : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
</script>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='13' fill='%23ffb020'/%3E%3Ccircle cx='20' cy='13' r='2.4' fill='%23141a2e'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400..600&family=Geist+Mono:wght@400;500&family=Newsreader:opsz,wght@6..72,300..500&display=swap">
<style>
  :root { --paper: #f6f5f1; --card: #fff; --ink: #0e1426; --soft: #4a5068; --faint: #80869b; --line: #e2e0d8; --cobalt: #2448f5; --leak: #d33a3f; --clean: #1d8a66; --canary: #ffcf33; color-scheme: light; }
  :root[data-theme="dark"] { --paper: #0b0f1d; --card: #131a2c; --ink: #eef0f7; --soft: #aab0c4; --faint: #7c8299; --line: #262d44; --cobalt: #8ea2ff; --leak: #ff6b70; --clean: #4fd1a5; color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--paper); color: var(--ink); font-family: Geist, system-ui, sans-serif; font-size: 16px; line-height: 1.55; }
  main { max-width: 1120px; margin: 0 auto; padding: 24px 16px 72px; }
  a { color: var(--cobalt); }
  code { font-family: 'Geist Mono', ui-monospace, monospace; font-size: .9em; }
  nav { display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: baseline; font-size: 14px; color: var(--faint); }
  nav a { color: var(--ink); font-weight: 600; text-decoration: none; }
  .eyebrow { margin: 36px 0 0; font-family: 'Geist Mono', monospace; font-size: 13px; color: var(--faint); }
  h1 { font-family: Newsreader, Georgia, serif; font-weight: 400; font-size: clamp(34px, 5vw, 54px); line-height: 1.08; margin: 10px 0 14px; display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; }
  .verdict { font-family: 'Geist Mono', monospace; font-weight: 500; font-size: 14px; letter-spacing: .06em; line-height: 1; padding: 8px 12px; border-radius: 999px; color: #fff; background: var(--leak); }
  .verdict.CLEAN { background: var(--clean); }
  .why { font-size: 18px; max-width: 66ch; margin: 0 0 20px; }
  .note { background: var(--card); border: 1px solid var(--line); border-left: 4px solid var(--canary); border-radius: 14px; padding: 14px 16px; font-size: 15px; color: var(--soft); max-width: 76ch; }
  .note b { color: var(--ink); }
  section { margin-top: 48px; }
  h2 { font-family: Newsreader, Georgia, serif; font-weight: 400; font-size: clamp(24px, 3vw, 30px); line-height: 1.2; margin: 0 0 8px; display: flex; gap: 12px; align-items: baseline; }
  .num { font-family: 'Geist Mono', monospace; font-size: 14px; color: var(--cobalt); }
  .meta { color: var(--soft); font-size: 15px; margin: 2px 0; overflow-wrap: anywhere; }
  details { font-size: 13px; color: var(--faint); margin: 8px 0 18px; }
  details code { display: block; margin-top: 6px; word-break: break-all; }
  .steps { list-style: none; padding: 0; margin: 18px 0 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr)); gap: 16px; }
  .step { background: var(--card); border: 1px solid var(--line); border-radius: 14px; overflow: hidden; display: flex; flex-direction: column; }
  .shot { display: block; aspect-ratio: 16 / 9; background: var(--line); }
  .shot img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: top; }
  .shot.none { display: grid; place-items: center; font-size: 13px; color: var(--faint); }
  .cap { padding: 10px 14px 14px; }
  .top { display: flex; justify-content: space-between; gap: 8px; font-family: 'Geist Mono', monospace; font-size: 12px; }
  .n { color: var(--faint); }
  .st { text-transform: uppercase; letter-spacing: .05em; color: var(--clean); }
  .bad .st { color: var(--leak); }
  .cap p { margin: 6px 0 4px; font-size: 14.5px; }
  .url { display: block; font-family: 'Geist Mono', monospace; font-size: 12px; color: var(--faint); overflow-wrap: anywhere; }
  footer { margin-top: 64px; padding-top: 18px; border-top: 1px solid var(--line); font-size: 14px; color: var(--faint); display: flex; flex-wrap: wrap; gap: 8px 18px; }
</style>
</head>
<body>
<main>
  <nav><a href="/">Stranger</a><span>Saved Kane CLI run</span></nav>
  <p class="eyebrow">Kane CLI · ${esc(date)} · ${esc(where(m.url))}</p>
  <h1>Run ${esc(m.id)} <span class="verdict ${esc(m.verdict)}">${esc(m.verdict)}</span></h1>
  <p class="why">${esc(m.why)}</p>
  <p class="note"><b>Why a saved copy?</b> Kane's share links expire after seven days (<a href="${DOCS}" target="_blank" rel="noopener">Kane's docs</a>), so the links Kane printed for this run no longer open. This page is built from the run's sealed evidence packs: Kane's own step list and screenshots, unedited. The packs' network logs stay out because they hold login tokens.</p>
${sections}
  <footer><a href="/">What is Stranger?</a><a href="https://github.com/Sanchay117/stranger">Code on GitHub</a></footer>
</main>
</body>
</html>
`
}

// Refuse to publish a page that contains a test password or a JWT.
function assertClean(html) {
  const secrets = []
  for (const f of [join(root, '.env'), join(root, '..', 'kane-loop', '.env')]) {
    if (!existsSync(f)) continue
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      const m = /^\s*[A-Z0-9_]*(PASSWORD|SECRET|TOKEN|KEY)\s*=\s*(.+)$/.exec(line)
      const v = m?.[2].trim().replace(/^["']|["']$/g, '')
      if (v && v.length >= 6) secrets.push(v)
    }
  }
  if (secrets.some((s) => html.includes(s))) throw new Error('page contains a secret from .env')
  if (/eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}/.test(html)) throw new Error('page contains a JWT')
}

function save(m, packs) {
  const dest = join(OUT, m.id)
  rmSync(dest, { recursive: true, force: true })
  mkdirSync(dest, { recursive: true })
  const tests = saveSteps(packs, dest)
  const html = page(m, tests)
  try {
    assertClean(html)
  } catch (e) {
    rmSync(dest, { recursive: true, force: true })
    throw e
  }
  writeFileSync(join(dest, 'index.html'), html)
  const counts = Object.entries(tests).map(([role, t]) => `${role} ${t.steps.length} steps`).join(', ')
  console.log(`saved /runs/${m.id}/  (${counts})`)
  return `/runs/${m.id}/`
}

function fromRunDir(dir) {
  const r = JSON.parse(readFileSync(join(dir, 'result.json'), 'utf8'))
  const run = (x) => (x ? { status: x.status, seconds: x.seconds, credits: x.credits, said: x.oneLiner, shareUrl: x.testUrl } : {})
  const m = { id: r.id, when: r.startedAt, url: r.url, verdict: r.verdict, why: r.why, owner: r.owner, stranger: r.stranger, runs: { owner: run(r.ownerRun), stranger: run(r.strangerRun) } }
  return save(m, packsIn(dir))
}

function bench() {
  const resultsFile = join(root, 'demo', 'bench', 'results.json')
  const results = JSON.parse(readFileSync(resultsFile, 'utf8'))
  let changed = false
  for (const c of results.cases ?? []) {
    const report = join(root, 'bench', 'cases', c.id, '.stranger', 'report.md')
    if (!existsSync(report)) continue
    const md = readFileSync(report, 'utf8')
    const section = md.split('## Kane runs')[1]?.split(/\n## /)[0] ?? ''
    const runs = {}
    const packs = []
    for (const r of section.matchAll(/^- (.+?): \*\*(\w+)\*\* in (\d+)s, ([\d.]+) credits\n((?: {2}- .*\n?)*)/gm)) {
      const sub = (k) => new RegExp(`^ {2}- ${k}: (.+)$`, 'm').exec(r[5])?.[1]
      const role = /^owner/i.test(r[1]) ? 'owner' : 'stranger'
      runs[role] = { status: r[2], seconds: Number(r[3]), credits: Number(r[4]), said: sub('Kane'), shareUrl: sub('Run') }
      const session = sub('Evidence')?.replace(/`/g, '').replace(/^~/, homedir())
      packs.push(...(session ? packsIn(session) : []))
    }
    if (Object.keys(runs).length < 2 || packs.length < 2) {
      console.log(`skip ${c.id}: found ${Object.keys(runs).length} of 2 Kane runs in report.md and ${packs.length} of 2 evidence packs on this machine`)
      continue
    }
    const m = {
      id: `bench-${c.id}`,
      when: /^- When: (\S+)/m.exec(md)?.[1] ?? c.at,
      url: /^- App: (\S+)/m.exec(md)?.[1] ?? results.url,
      verdict: c.verdict,
      why: c.why,
      owner: /^- Owner: (\S+)/m.exec(md)?.[1] ?? 'the owner',
      stranger: /^- Stranger: (\S+)/m.exec(md)?.[1] ?? 'the stranger',
      runs,
    }
    c.saved = save(m, packs)
    changed = true
  }
  if (changed) writeFileSync(resultsFile, JSON.stringify(results, null, 2) + '\n')
}

const args = process.argv.slice(2)
if (args[0] === '--bench') bench()
else if (args.length) args.forEach(fromRunDir)
else console.log('usage: node scripts/save-kane-runs.mjs <stranger run dir>... | --bench')
