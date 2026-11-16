#!/usr/bin/env node
// Claude Code Stop hook. While Stranger is armed (.stranger/armed exists, or STRANGER_HOOK=1),
// the agent cannot finish a turn that changed watched files until Stranger says CLEAN.
// On a LEAK it blocks the stop and hands the agent .stranger/FIX.md. Gives up after 3 tries.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { spawnSync, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const MAX_TRIES = 3
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

if (fp === state.cleanAt) process.exit(0)

if ((state.tries[session] ?? 0) >= MAX_TRIES) {
  reply({ systemMessage: `Stranger still saw a leak after ${MAX_TRIES} tries in this session. Stopping so a person can look: .stranger/report.md` })
}

if (fp === state.leakAt && input.stop_hook_active) {
  state.tries[session] = (state.tries[session] ?? 0) + 1
  save()
  reply({
    decision: 'block',
    reason: 'Stranger found a data leak and nothing in the watched files has changed since. Read .stranger/FIX.md and fix it at the database, or tell the user plainly why you cannot.',
  })
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
