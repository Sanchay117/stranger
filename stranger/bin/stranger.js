#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { loadConfig, DEFAULT_CONFIG, TEMPLATE } from '../src/config.js'
import { check } from '../src/check.js'
import { blastRows, renderReport, writeReport } from '../src/report.js'
import { ensureGitignore, installClaude } from '../src/install.js'
import { checkGuards, loadGuards, recordGuards, runKaneGuards, updateStates } from '../src/guards.js'

const HELP = `stranger: you only ever test your app as yourself. Stranger tests it as someone else.

Usage
  stranger run             Plant a canary as the owner, then look for it as a second account (two Kane CLI runs)
  stranger init            Write a starter stranger.config.json
  stranger install-claude  Add the Stranger skill and Stop hook to this project's .claude/
  stranger report          Rewrite .stranger/report.md and FIX.md from the last run (no Kane run)
  stranger guard           Check every leak found before is still closed (no Kane run, no credits)
  stranger guard --kane    Also replay the Kane guard tests with kane-cli testrun (one evidence pack)
  stranger guard --record  Turn the last run's leaks into guards (no Kane run)

Options
  --config <path>  Config file (default: stranger.config.json)
  --url <url>      Override the app URL
  --json           Print one JSON result line on stdout (for coding agents and CI)
  --headed         Show the browser instead of running headless
  --timeout <s>    Per Kane run (default: 420)

Exit codes: 0 CLEAN, 1 LEAK / TAMPER / OVERLOCKED, 2 INCONCLUSIVE, 3 setup error.
"stranger guard": 0 every guard holds, 1 one broke, 2 one could not tell, 3 setup error.
Needs Kane CLI: npm install -g @testmuai/kane-cli && kane-cli login`

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    config: { type: 'string', default: DEFAULT_CONFIG },
    url: { type: 'string' },
    json: { type: 'boolean', default: false },
    headed: { type: 'boolean', default: false },
    timeout: { type: 'string' },
    kane: { type: 'boolean', default: false },
    record: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
})

const command = positionals[0] ?? 'run'
const tty = process.stderr.isTTY && !values.json
const c = (code) => (s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s)
const dim = c('2')
const bold = c('1')
const red = c('1;31')
const green = c('1;32')
const yellow = c('1;33')
const say = (line = '') => {
  if (!values.json) process.stderr.write(line + '\n')
}

if (values.help || command === 'help') {
  console.log(HELP)
  process.exit(0)
}

// Kane writes the test accounts' passwords into its run folder, so run folders never go into git.
const ignored = ensureGitignore(process.cwd())
if (ignored.length) say(dim(`Added to .gitignore: ${ignored.join(', ')}`))

if (command === 'init') {
  if (existsSync(values.config)) {
    console.error(`${values.config} already exists`)
    process.exit(3)
  }
  writeFileSync(values.config, JSON.stringify(TEMPLATE, null, 2) + '\n')
  console.log(`Wrote ${values.config}. Set OWNER_* and STRANGER_* in .env: two test accounts you own on the app.`)
  process.exit(0)
}

if (command === 'install-claude') {
  for (const line of installClaude(process.cwd())) console.log(line)
  console.log('\nArm the hook with: touch .stranger/armed   (disarm: rm .stranger/armed)')
  if (!existsSync(values.config)) console.log('No stranger.config.json yet: run "stranger init" first.')
  process.exit(0)
}

if (command === 'report') {
  try {
    const cfg = loadConfig(values.config)
    const last = JSON.parse(readFileSync(join(cfg.root, '.stranger', 'last.json'), 'utf8'))
    const files = renderReport(cfg, last)
    console.log(`Rewrote ${files.report}${files.fix ? ` and ${files.fix}` : ''} from run ${last.id} (${last.verdict}).`)
    process.exit(0)
  } catch (err) {
    console.error(`stranger report: ${err.code === 'ENOENT' ? 'no .stranger/last.json yet: run "stranger run" first' : err.message}`)
    process.exit(3)
  }
}

if (command === 'guard') {
  let cfg
  try {
    cfg = loadConfig(values.config, values.url ? { url: values.url } : {})
  } catch (err) {
    console.error(`stranger: ${err.message}`)
    process.exit(3)
  }
  if (values.record) {
    try {
      const last = JSON.parse(readFileSync(join(cfg.root, '.stranger', 'last.json'), 'utf8'))
      const rec = recordGuards(cfg, last)
      say(`From run ${last.id} (${last.verdict}): ${rec.added.length} new API ${rec.added.length === 1 ? 'guard' : 'guards'}, ${rec.kane.length} new Kane ${rec.kane.length === 1 ? 'guard' : 'guards'}.`)
    } catch (err) {
      console.error(`stranger guard: ${err.code === 'ENOENT' ? 'no .stranger/last.json yet: run "stranger run" first' : err.message}`)
      process.exit(3)
    }
  }
  const { data } = loadGuards(cfg)
  if (!data.guards.length && !data.kane.length) {
    say('No guards yet. Each leak "stranger run" finds becomes one.')
    if (values.json) process.stdout.write(JSON.stringify({ verdict: 'NONE', guards: [] }) + '\n')
    process.exit(0)
  }
  const paint = (v) => (v === 'HOLDS' ? green(v) : v === 'UNKNOWN' || v === 'NONE' ? yellow(v) : red(v))
  let api = []
  if (data.guards.length) {
    say(`${bold('Stranger guards')} ${dim(`${data.guards.length} ${data.guards.length === 1 ? 'read' : 'reads'} that leaked before, sent again as the owner, the stranger and with no login`)}`)
    try {
      api = await checkGuards(cfg, data.guards)
    } catch (err) {
      console.error(`stranger guard: ${err.message}`)
      process.exit(3)
    }
    for (const r of api) {
      const g = data.guards.find((x) => x.id === r.id)
      say(`  ${paint(r.status.padEnd(7))} ${r.method} ${r.path.split('?')[0]} ${dim(`(found in run ${g?.found?.run ?? '?'}): ${r.why}`)}`)
    }
  }
  let kane = null
  if (values.kane && data.kane.length) {
    say(`\n${bold('Kane guards')} ${dim(`${data.kane.length} ${data.kane.length === 1 ? 'test' : 'tests'} with kane-cli testrun (recorded steps replay; new ones are authored first)`)}`)
    kane = await runKaneGuards(cfg, {
      headless: !values.headed,
      onEvent: (e) => {
        const t = e.type ?? e.event
        if (t === 'testrun_member_start' || t === 'testrun_member_end') say(`    ${dim(`${t === 'testrun_member_start' ? 'start' : 'end  '} ${e.member ?? e.name ?? e.path ?? ''} ${e.status ?? ''}`)}`)
      },
    })
    for (const r of kane?.results ?? []) say(`  ${paint(r.status.padEnd(7))} ${r.file} ${dim(r.why)}`)
    if (kane) {
      say(dim(`    ${kane.seconds}s${kane.credits != null ? `, ${kane.credits} credits` : ''}${kane.testUrl ? `, ${kane.testUrl}` : ''}`))
      if (kane.cleaned === false) say(yellow("    Could not delete every row the guard planted; check the owner's and the stranger's records."))
      if (kane.secrets.length) say(red(`    Kane's recordings hold a password (${kane.secrets.join(', ')}). Keep .stranger/guards/kane/output-*/ out of git.`))
    }
  } else if (data.kane.length) {
    say(dim(`\n  ${data.kane.length} Kane ${data.kane.length === 1 ? 'guard' : 'guards'} not run (add --kane: replays use far fewer credits than a check)`))
  }
  updateStates(cfg, api, kane?.results ?? [])
  const all = [...api, ...(kane?.results ?? [])]
  const verdict = !all.length ? 'NONE' : all.some((r) => r.status === 'BROKEN') ? 'BROKEN' : all.some((r) => r.status === 'UNKNOWN') ? 'UNKNOWN' : 'HOLDS'
  if (values.json) {
    process.stdout.write(
      JSON.stringify({
        verdict,
        guards: api.map(({ id, table, method, path, status, why, tries }) => ({ id, table, method, path, status, why, tries })),
        ...(kane ? { kane: { exitCode: kane.exitCode, results: kane.results, testUrl: kane.testUrl, credits: kane.credits } } : {}),
      }) + '\n',
    )
  } else {
    say(`\n${paint(verdict)}  ${verdict === 'HOLDS' ? 'Every leak found before is still closed.' : verdict === 'BROKEN' ? 'A leak found before is open again.' : verdict === 'NONE' ? 'Nothing was checked.' : 'Some guards could not tell this time.'}`)
  }
  process.exit(verdict === 'HOLDS' || verdict === 'NONE' ? 0 : verdict === 'BROKEN' ? 1 : 2)
}

if (command !== 'run') {
  console.error(HELP)
  process.exit(3)
}

let cfg
try {
  const overrides = {}
  if (values.url) overrides.url = values.url
  if (values.timeout) overrides.timeout = Number(values.timeout)
  cfg = loadConfig(values.config, overrides)
} catch (err) {
  console.error(`stranger: ${err.message}`)
  process.exit(3)
}

say(`${bold('Stranger')} ${dim('checks')} ${cfg.url}${cfg.probes.length > 1 ? dim(` with ${cfg.probes.length} probes (${cfg.probes.length * 2} Kane runs)`) : ''}`)

const labels = { owner: `1/2 ${cfg.owner.email} plants a canary`, stranger: `2/2 ${cfg.stranger.email} looks for it` }
const seenSteps = new Set()

const result = await check(cfg, {
  headless: !values.headed,
  onProgress: ({ phase, event, canary, run, probe, index, total, replay, api, links }) => {
    if (phase === 'owner' && canary && total > 1) say(`\n${bold(`Probe ${index + 1}/${total}: ${probe}`)}`)
    if (phase === 'owner' && canary) say(`\n  ${labels.owner} ${dim(canary)}`)
    if (phase === 'stranger' && canary) say(`\n  ${labels.stranger}${links?.length ? dim(`, then opens the owner's record ${links.length === 1 ? 'page' : 'pages'} directly`) : ''}`)
    if (phase === 'stranger' && canary) for (const link of links ?? []) say(`    ${dim(`direct link: ${link.slice(0, 100)}`)}`)
    if (event && event.step !== undefined && (event.status === 'failed' || (event.status === 'done' && event.remark))) {
      const key = `${index}:${phase}:${event.step}:${event.status}`
      if (seenSteps.has(key)) return
      seenSteps.add(key)
      const mark = event.status === 'done' ? green('✓') : red('✗')
      say(`    ${mark} ${dim(String(event.remark ?? `step ${event.step}`).slice(0, 110))}`)
    }
    if (run) say(`    ${dim(`${run.status} in ${run.seconds}s${run.credits != null ? `, ${run.credits} credits` : ''}`)}`)
    if (phase === 'api') say(`\n  ${dim('API checks: every data read again, as the stranger and with no login, then numeric, tamper, forged owner, files, live updates and personas')}`)
    if (replay?.length || api) {
      for (const r of replay ?? []) {
        if (r.skipped) {
          say(`    ${yellow('-')} ${dim(`${'not sent'.padEnd(16)}  ${r.method} ${r.url.split('?')[0].slice(0, 70)}: ${r.skipped}`)}`)
          continue
        }
        const mark = r.hit ? red('✗') : r.error ? yellow('-') : green('✓')
        say(`    ${mark} ${dim(`${r.as === 'stranger' ? 'stranger\'s login' : 'no login'.padEnd(16)}  ${(r.method ?? 'GET').padEnd(4)} ${r.url.split('?')[0].slice(0, 70)} -> ${r.status ?? r.error}${r.hit ? ', owner\'s canary in it' : ''}`)}`)
      }
      const n = api?.numeric
      if (n) say(`    ${n.ran && n.changed.some((c) => !c.canary) ? red('✗') : n.ran ? green('✓') : yellow('-')} ${dim(n.ran ? `numeric canary: ${n.changed.some((c) => !c.canary) ? `${n.changed.filter((c) => !c.canary).length} of the stranger's totals or counts moved` : n.changed.length ? "only the new row's own text showed up (the read check covers that)" : 'nothing the stranger reads moved'}` : `numeric canary not run: ${n.why}`)}`)
      const t = api?.tamper
      if (t) say(`    ${t.ran && (t.edited || t.deleted) ? red('✗') : t.ran ? green('✓') : yellow('-')} ${dim(t.ran ? `tamper: change ${t.edited ? 'went through' : 'blocked'}, delete ${t.deleted ? 'went through' : 'blocked'}` : `tamper not run: ${t.why}`)}`)
      const f = api?.forge
      if (f) say(`    ${f.ran && f.forged ? red('✗') : f.ran ? green('✓') : yellow('-')} ${dim(f.ran ? `forged owner: a row in the owner's name ${f.forged ? 'was stored' : 'was refused'} (HTTP ${f.status ?? '?'})` : `forged owner not run: ${f.why}`)}`)
      for (const b of api?.storage ?? []) {
        const got = b.ran ? b.tries.filter((t) => t.hit) : []
        say(`    ${!b.ran ? yellow('-') : got.length ? red('✗') : green('✓')} ${dim(b.ran ? `files in ${b.bucket}: ${got.length ? got.map((t) => `${t.as === 'stranger' ? 'stranger' : 'no login'} could ${t.kind}`).join(', ') : 'stranger and no login blocked'}` : `files in ${b.bucket} not checked: ${b.why}`)}`)
      }
      const rt = api?.realtime
      if (rt) say(`    ${rt.ran && rt.heard.length ? red('✗') : rt.ran ? green('✓') : yellow('-')} ${dim(rt.ran ? `live updates: ${rt.heard.length ? `heard the owner's row (${rt.heard.map((h) => `${h.kind} on ${h.topic}`).join(', ')})` : `heard nothing on ${rt.joined.length} channels`}` : `live updates not checked: ${rt.why}`)}`)
      for (const x of api?.personas ?? []) say(`    ${!x.ran ? yellow('-') : x.ok ? green('✓') : red('✗')} ${dim(x.ran ? `${x.name} (should ${x.expect}): ${x.sees ? 'sees' : 'does not see'} the canary` : `${x.name}: ${x.why}`)}`)
      for (const note of api?.notes ?? []) say(`    ${yellow('-')} ${dim(note)}`)
    }
    if (api?.blast?.length) {
      say(`\n  ${bold('Blast radius')}`)
      const width = Math.max(...api.blast.map(({ table }) => table.length))
      const indent = ' '.repeat(width + 6)
      for (const { table, stranger, anonymous, sensitive } of api.blast) {
        const exposed = stranger?.othersRows > 0 || anonymous?.othersRows > 0
        const paint = exposed ? red : dim
        say(paint(`    ${table.padEnd(width)}  stranger reads ${blastRows(stranger, true)}`))
        say(paint(`${indent}with no login ${blastRows(anonymous)}`))
        if (exposed && sensitive.length) {
          const more = sensitive.length > 3 ? ` (+${sensitive.length - 3} more)` : ''
          say(paint(`${indent}exposed: ${sensitive.slice(0, 3).join(', ')}${more}`))
        }
      }
    }
  },
})

const files = writeReport(cfg, result)
const guarded = cfg.guards ? recordGuards(cfg, result) : null
if (guarded?.added.length || guarded?.reopened.length || guarded?.kane.length) {
  say('')
  for (const g of guarded.added) say(`  ${bold('New guard')} ${dim(`${g.method} ${g.path.split('?')[0]} (${g.logins.join(', ')}): "stranger guard" checks it again in seconds, with no Kane run`)}`)
  for (const g of guarded.reopened) say(`  ${red('Guard reopened')} ${dim(`${g.method} ${g.path.split('?')[0]}: a leak fixed before is back`)}`)
  for (const k of guarded.kane) say(`  ${bold('New Kane guard')} ${dim(`.stranger/guards/kane/${k.file}: "stranger guard --kane" replays it with kane-cli testrun`)}`)
}

if (values.json) {
  process.stdout.write(
    JSON.stringify({
      verdict: result.verdict,
      why: result.why,
      canary: result.canary,
      report: files.report,
      fix: files.fix,
      ownerRun: result.ownerRun?.testUrl ?? null,
      strangerRun: result.strangerRun?.testUrl ?? null,
      findings: result.findings?.map((f) => f.kind) ?? [],
      ...(guarded ? { guards: { added: guarded.added.length, reopened: guarded.reopened.length, kane: guarded.kane.length } } : {}),
      ...(result.coverage ? { coverage: `${result.coverage.probed.length}/${result.coverage.tables.length}` } : {}),
      ...(result.blast?.length ? { blast: result.blast.map(({ table, stranger, anonymous, sensitive }) => ({ table, stranger, anonymous, sensitive })) } : {}),
      ...(result.probes.length > 1 ? { probes: result.probes.map((p) => ({ name: p.probe, verdict: p.verdict, canary: p.canary })) } : {}),
    }) + '\n',
  )
} else {
  const paint = (v) => (v === 'CLEAN' ? green(v) : v === 'INCONCLUSIVE' ? yellow(v) : red(v))
  if (result.probes.length > 1) {
    say('')
    for (const p of result.probes) say(`  ${paint(p.verdict)}  ${p.probe}`)
  }
  say(`\n${paint(result.verdict)}  ${result.why}`)
  if (result.strangerRun?.testUrl) say(dim(`      Kane run: ${result.strangerRun.testUrl}`))
  say(dim(`      Report: ${files.report}`))
  if (files.fix) say(`      Fix brief for your coding agent: ${bold(files.fix)}`)
}

process.exit(result.verdict === 'CLEAN' ? 0 : result.verdict === 'INCONCLUSIVE' ? 2 : 1)
