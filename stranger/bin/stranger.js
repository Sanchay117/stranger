#!/usr/bin/env node
import { existsSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { loadConfig, DEFAULT_CONFIG, TEMPLATE } from '../src/config.js'
import { check } from '../src/check.js'
import { writeReport } from '../src/report.js'
import { ensureGitignore, installClaude } from '../src/install.js'

const HELP = `stranger: you only ever test your app as yourself. Stranger tests it as someone else.

Usage
  stranger run             Plant a canary as the owner, then look for it as a second account (two Kane CLI runs)
  stranger init            Write a starter stranger.config.json
  stranger install-claude  Add the Stranger skill and Stop hook to this project's .claude/

Options
  --config <path>  Config file (default: stranger.config.json)
  --url <url>      Override the app URL
  --json           Print one JSON result line on stdout (for coding agents and CI)
  --headed         Show the browser instead of running headless
  --timeout <s>    Per Kane run (default: 420)

Exit codes: 0 CLEAN, 1 LEAK, 2 INCONCLUSIVE, 3 setup error.
Needs Kane CLI: npm install -g @testmuai/kane-cli && kane-cli login`

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    config: { type: 'string', default: DEFAULT_CONFIG },
    url: { type: 'string' },
    json: { type: 'boolean', default: false },
    headed: { type: 'boolean', default: false },
    timeout: { type: 'string' },
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

say(`${bold('Stranger')} ${dim('checks')} ${cfg.url}`)

const labels = { owner: `1/2 ${cfg.owner.email} plants a canary`, stranger: `2/2 ${cfg.stranger.email} looks for it` }
const seenSteps = new Set()

const result = await check(cfg, {
  headless: !values.headed,
  onProgress: ({ phase, event, canary, run }) => {
    if (phase === 'owner' && canary) say(`\n  ${labels.owner} ${dim(canary)}`)
    if (phase === 'stranger' && canary) say(`\n  ${labels.stranger}`)
    if (event && event.step !== undefined && (event.status === 'failed' || (event.status === 'done' && event.remark))) {
      const key = `${phase}:${event.step}:${event.status}`
      if (seenSteps.has(key)) return
      seenSteps.add(key)
      const mark = event.status === 'done' ? green('✓') : red('✗')
      say(`    ${mark} ${dim(String(event.remark ?? `step ${event.step}`).slice(0, 110))}`)
    }
    if (run) say(`    ${dim(`${run.status} in ${run.seconds}s${run.credits != null ? `, ${run.credits} credits` : ''}`)}`)
  },
})

const files = writeReport(cfg, result)

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
    }) + '\n',
  )
} else {
  const tag = result.verdict === 'LEAK' ? red('LEAK') : result.verdict === 'CLEAN' ? green('CLEAN') : yellow('INCONCLUSIVE')
  say(`\n${tag}  ${result.why}`)
  if (result.strangerRun?.testUrl) say(dim(`      Kane run: ${result.strangerRun.testUrl}`))
  say(dim(`      Report: ${files.report}`))
  if (files.fix) say(`      Fix brief for your coding agent: ${bold(files.fix)}`)
}

process.exit(result.verdict === 'CLEAN' ? 0 : result.verdict === 'LEAK' ? 1 : 2)
