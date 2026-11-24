// Runs Stranger (real Kane CLI, about 50 credits a case) on every bench case and writes the scorecard.
// Usage: node --env-file=.env bench/run.mjs [--url http://localhost:5231] [--only detail_page,all_good] [--no-reset]
//        node bench/run.mjs --score-only   (no Kane runs: rebuild the scorecard from demo/bench/results.json)
//
// Each case gets its own folder, bench/cases/<case>/, with a stranger.config.json and the usual
// .stranger/ output (report.md, FIX.md and history.jsonl are tracked as proof). Before the first case,
// scripts/bench-apply.mjs recreates every case table, so each bench run starts from empty tables.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { CASES, LIMITS, caught } from '../demo/bench/cases.js'

const root = new URL('..', import.meta.url).pathname
const { values } = parseArgs({ options: { url: { type: 'string' }, only: { type: 'string' }, 'no-reset': { type: 'boolean', default: false }, 'score-only': { type: 'boolean', default: false } } })
const only = values.only ? new Set(values.only.split(',')) : null
const picked = values['score-only'] ? [] : CASES.filter((c) => !only || only.has(c.id))
if (!picked.length && !values['score-only']) {
  console.error(`No such case. Cases: ${CASES.map((c) => c.id).join(', ')}`)
  process.exit(3)
}

const CONFIG = (c) => ({
  url: '$BENCH_URL',
  owner: { email: '$OWNER_EMAIL', password: '$OWNER_PASSWORD' },
  stranger: { email: '$STRANGER_EMAIL', password: '$STRANGER_PASSWORD' },
  plant: 'click New note, type "Stranger check" as the Title and 1 as the Amount, and type the text into the Note field',
  look: 'the Your notes list',
  database: 'supabase',
  migrations: '../../migrations',
})

if (!values['no-reset'] && picked.length) {
  const r = spawnSync(process.execPath, [join(root, 'scripts', 'bench-apply.mjs')], { stdio: 'inherit', env: process.env })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

const resultsFile = join(root, 'demo', 'bench', 'results.json')
const SITE = 'https://stranger-2yf3.vercel.app'
const previous = existsSync(resultsFile) ? JSON.parse(readFileSync(resultsFile, 'utf8')) : { cases: [] }
// Older results are re-judged with the current expectations in cases.js.
const kept = new Map((previous.cases ?? []).map((r) => [r.id, { ...r, caught: caught(CASES.find((c) => c.id === r.id) ?? { expect: { verdict: '', seen: [] } }, r) }]))
values.url ??= previous.url ?? 'http://localhost:5231'

for (const c of picked) {
  const dir = join(root, 'bench', 'cases', c.id)
  mkdirSync(dir, { recursive: true })
  const config = join(dir, 'stranger.config.json')
  writeFileSync(config, JSON.stringify(CONFIG(c), null, 2) + '\n')
  const url = `${values.url.replace(/\/$/, '')}/bench/?case=${c.id}`
  console.log(`\n${c.id}: ${c.title}\n  ${url}`)

  const started = Date.now()
  const out = await new Promise((resolve) => {
    const child = spawn(process.execPath, [join(root, 'stranger', 'bin', 'stranger.js'), 'run', '--json', '--config', config], { cwd: root, env: { ...process.env, BENCH_URL: url }, stdio: ['ignore', 'pipe', 'inherit'] })
    let text = ''
    child.stdout.on('data', (d) => (text += d))
    child.on('close', (code) => resolve({ code, text }))
  })
  let line = null
  try {
    line = JSON.parse(out.text.trim().split('\n').at(-1))
  } catch {}
  const lastFile = join(dir, '.stranger', 'last.json')
  const last = line && existsSync(lastFile) ? JSON.parse(readFileSync(lastFile, 'utf8')) : null
  if (!last) {
    console.log(`  no result (exit ${out.code})`)
    continue
  }
  const run = {
    id: c.id,
    at: last.startedAt,
    verdict: last.verdict,
    seen: last.seen ?? null,
    findings: (last.findings ?? []).map((f) => ({ kind: f.kind, seen: f.seen ?? null })),
    why: last.why,
    canary: last.canary,
    ownerRun: last.ownerRun?.testUrl ?? null,
    strangerRun: last.strangerRun?.testUrl ?? null,
    credits: Math.round(((last.ownerRun?.credits ?? 0) + (last.strangerRun?.credits ?? 0)) * 10) / 10,
    seconds: Math.round((Date.now() - started) / 1000),
  }
  run.caught = caught(c, run)
  kept.set(c.id, run)
  console.log(`  ${run.verdict}${run.seen ? ` (${run.seen})` : ''}: ${run.caught ? (c.expect.verdict === 'CLEAN' ? 'clean, as expected' : 'caught') : `MISSED, expected ${c.expect.verdict}`}  ${run.credits} credits`)
}

const cases = CASES.map((c) => kept.get(c.id)).filter(Boolean)
const results = { at: cases.map((r) => r.at).filter(Boolean).sort().at(-1) ?? new Date().toISOString(), url: values.url, credits: cases.reduce((s, r) => s + r.credits, 0), cases }
writeFileSync(resultsFile, JSON.stringify(results, null, 2) + '\n')

// The scorecard in the repo, the same numbers as the /bench/ page.
const bugs = CASES.filter((c) => c.expect.verdict !== 'CLEAN')
const found = bugs.filter((c) => kept.get(c.id)?.caught)
const control = CASES.filter((c) => c.expect.verdict === 'CLEAN').map((c) => kept.get(c.id))
const row = (c) => {
  const r = kept.get(c.id)
  const mark = !r ? 'not run' : r.caught ? (c.expect.verdict === 'CLEAN' ? 'clean, as it should be' : 'caught') : '**missed**'
  // Kane's share links expire after seven days; a saved copy (scripts/save-kane-runs.mjs --bench) lasts.
  const kane = r?.saved ? `[run](${SITE}${r.saved})` : r?.strangerRun ? `[run](${r.strangerRun})` : ''
  return `| [${c.id}](cases/${c.id}/.stranger/report.md) | ${c.bug} | ${c.expect.verdict} | ${r ? `${r.verdict}${r.seen ? ` (${r.seen})` : ''}` : ''} | ${mark} | ${kane} |`
}
writeFileSync(
  join(root, 'bench', 'README.md'),
  [
    '# Stranger bench',
    '',
    'Ten small notes apps on one Supabase project. Each has one bug left in on purpose, a different way to leak or',
    'tamper with another account\'s data, and one has none. Stranger runs on each with the real Kane CLI, the same',
    'way it runs on any app: the owner plants a canary, a second account looks for it, then the API checks.',
    '',
    `**Stranger caught ${found.length} of ${bugs.length} bugs${control.every((r) => r?.caught) ? ' and stayed quiet on the clean control' : ''}.** ${cases.length} cases run, ${Math.round(results.credits)} Kane credits, against ${values.url}.`,
    '',
    '| Case | The bug | Expected | Stranger said | | Kane |',
    '| --- | --- | --- | --- | --- | --- |',
    ...CASES.map(row),
    '',
    'Each case folder has the run\'s `report.md`, its `FIX.md` (the brief a coding agent gets) and `history.jsonl`.',
    'Kane\'s share links expire after seven days, so the Kane column opens a saved copy of the run: Kane\'s own steps and screenshots.',
    'The bugs are in [`migrations/`](migrations/), the app is [`demo/bench/`](../demo/bench/), live at `/bench/?case=<case>`.',
    '',
    '## What Stranger does not catch',
    '',
    ...LIMITS.map((l) => `- ${l}`),
    '',
    '## Run it',
    '',
    '```bash',
    'node --env-file=.env scripts/bench-apply.mjs          # create or reset the case tables (needs SUPABASE_DB_URL)',
    'node --env-file=.env bench/run.mjs --url http://localhost:5231   # about 50 Kane credits a case',
    '```',
    '',
  ].join('\n'),
)
// The same line at the top of the main README's bench section.
const readme = join(root, 'README.md')
const score = `**Stranger caught ${found.length} of ${bugs.length} bugs${control.every((r) => r?.caught) ? ' and stayed quiet on the clean control' : ''}**, in ${cases.length} real Kane CLI runs (${new Date(results.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}).`
writeFileSync(readme, readFileSync(readme, 'utf8').replace(/<!-- bench-score -->[\s\S]*?<!-- \/bench-score -->/, `<!-- bench-score -->${score}<!-- /bench-score -->`))
console.log(`\nStranger caught ${found.length} of ${bugs.length} bugs. ${Math.round(results.credits)} credits. Scorecard: bench/README.md and /bench/`)
