#!/usr/bin/env node
// A stand-in for "claude -p" in the fix loop test. Like the real agent it writes a migration
// (FAKE_CLAUDE_SQL) into the migrations folder, then stops the way Claude Code does: by running the
// Stop hook (FAKE_CLAUDE_HOOK), here with FAKE_CLAUDE_KANE_MODES for the hook's Stranger run.
// It prints stream-json lines ending with a "result" line, like Claude Code's --output-format stream-json.
import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const root = process.cwd()
const args = process.argv.slice(2)
const prompt = args[args.indexOf('-p') + 1] ?? ''
if (!prompt.includes('.stranger/FIX.md') || !readFileSync(join(root, '.stranger', 'FIX.md'), 'utf8')) process.exit(9)
const { migrations } = JSON.parse(readFileSync(join(root, 'stranger.config.json'), 'utf8'))
writeFileSync(join(root, migrations, '0002_fix.sql'), process.env.FAKE_CLAUDE_SQL ?? '-- nothing')

const hook = spawnSync(process.execPath, [process.env.FAKE_CLAUDE_HOOK], {
  cwd: root,
  input: JSON.stringify({ session_id: 'ci', stop_hook_active: false, cwd: root }),
  env: { ...process.env, CLAUDE_PROJECT_DIR: root, FAKE_KANE_MODES: process.env.FAKE_CLAUDE_KANE_MODES ?? 'clean' },
  encoding: 'utf8',
})
let out = {}
try {
  out = JSON.parse(hook.stdout || '{}')
} catch {}
console.log(JSON.stringify({ type: 'system', subtype: 'stop_hook', output: out }))
console.log(JSON.stringify({ type: 'result', result: out.decision === 'block' ? 'Stranger still blocks: the fix did not hold.' : 'Wrote 0002_fix.sql and applied it. Stranger says CLEAN.' }))
