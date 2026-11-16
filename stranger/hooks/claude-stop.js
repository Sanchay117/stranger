#!/usr/bin/env node
// Claude Code Stop hook. While Stranger is armed (.stranger/armed exists, or STRANGER_HOOK=1),
// the agent cannot finish a turn that changed watched files until Stranger says CLEAN.
// On a LEAK it blocks the stop and hands the agent .stranger/FIX.md.
// Two limits keep it from trapping the agent: after 3 Stranger runs that still found a leak, and after
// 2 reminders where nothing changed (the agent can't or shouldn't fix it and has said why), it lets go.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { spawnSync, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const MAX_TRIES = 3
const MAX_NUDGES = 2
let input = {}
try {
  input = JSON.parse(readFileSync(0, 'utf8') || '{}')
} catch {}

const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd()
const dir = join(root, '.stranger')
if (process.env.STRANGER_HOOK !== '1' && !existsSync(join(dir, 'armed'))) process.exit(0)

const reply = (obj) => {
  process.stdout.write(JSON.stringify(obj))
  process.exit(0)
}

let config = {}
try {
  config = JSON.parse(readFileSync(join(root, 'stranger.config.json'), 'utf8'))
} catch {
  reply({ systemMessage: 'Stranger is armed but stranger.config.json is missing, so nothing was checked.' })
}

// A fingerprint of the watched paths: HEAD plus uncommitted changes plus untracked files.
function fingerprint(paths) {
  const git = (...args) => {
    try {
      return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
    } catch {
      return ''
    }
  }
  const hash = createHash('sha256')
  hash.update(git('rev-parse', 'HEAD'))
  hash.update(git('diff', 'HEAD', '--', ...paths))
  for (const file of git('ls-files', '--others', '--exclude-standard', '--', ...paths).split('\n').filter(Boolean)) {
    hash.update(file)
    try {
      hash.update(readFileSync(join(root, file)))
    } catch {}
  }
  return hash.digest('hex').slice(0, 16)
}

mkdirSync(dir, { recursive: true })
const statePath = join(dir, 'hook-state.json')
let state = {}
try {
  state = JSON.parse(readFileSync(statePath, 'utf8'))
} catch {}
const save = () => writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n')

const fp = fingerprint(config.watch?.length ? config.watch : ['.'])
const session = input.session_id ?? 'default'
state.tries ??= {}
state.nudges ??= {}

if (fp === state.cleanAt) process.exit(0)

// Nothing changed since the last leak: no new Kane run, just a reminder, at most MAX_NUDGES per user turn.
if (fp === state.leakAt) {
  if (!input.stop_hook_active) state.nudges[session] = 0
  state.nudges[session] = (state.nudges[session] ?? 0) + 1
  save()
  if (state.nudges[session] > MAX_NUDGES) {
    reply({ systemMessage: `Stranger: still LEAK, and nothing in the watched files changed after ${MAX_NUDGES} reminders. Letting the agent stop so a person can decide: .stranger/report.md` })
  }
  reply({
    decision: 'block',
    reason: 'Stranger found a data leak and nothing in the watched files has changed since. Read .stranger/FIX.md and fix it at the database, or tell the user plainly why you cannot.',
  })
}

if ((state.tries[session] ?? 0) >= MAX_TRIES) {
  reply({ systemMessage: `Stranger still saw a leak after ${MAX_TRIES} checks of the agent's changes in this session. Stopping so a person can look: .stranger/report.md` })
}

// Inside the Stranger repo the CLI sits next to this file. Copied into another project by
// "stranger install-claude", it runs the published CLI through npx instead.
const bin = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'stranger.js')
const [cmd, args] = existsSync(bin)
  ? [process.execPath, [bin, 'run', '--json']]
  : ['npx', ['--yes', 'github:Sanchay117/stranger', 'run', '--json']]
const run = spawnSync(cmd, args, { cwd: root, encoding: 'utf8', timeout: 15 * 60 * 1000 })
let result = null
try {
  result = JSON.parse(run.stdout.trim().split('\n').at(-1))
} catch {}

if (!result) reply({ systemMessage: `Stranger could not run (exit ${run.status}). ${String(run.stderr).trim().split('\n').at(-1) ?? ''}` })
state.nudges[session] = 0

if (result.verdict === 'CLEAN') {
  state.cleanAt = fp
  state.leakAt = null
  state.tries[session] = 0
  save()
  reply({ systemMessage: `Stranger: CLEAN. ${result.why} Canary ${result.canary}. ${result.strangerRun ?? ''}`.trim() })
}

if (result.verdict === 'LEAK') {
  state.leakAt = fp
  state.tries[session] = (state.tries[session] ?? 0) + 1
  save()
  let brief = ''
  try {
    brief = readFileSync(join(root, '.stranger', 'FIX.md'), 'utf8')
  } catch {}
  reply({
    decision: 'block',
    reason: `Stranger ran Kane CLI as a second account and found a data leak. ${result.why}\n\n${brief}\nFix it, apply it, then stop again: this hook re-runs Stranger with a fresh canary.`,
  })
}

reply({ systemMessage: `Stranger: INCONCLUSIVE. ${result.why} Not blocking. See .stranger/report.md` })
