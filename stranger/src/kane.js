import { spawn } from 'node:child_process'
import { writeFileSync, rmSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// Runs one Kane CLI objective in agent mode and collects its NDJSON stream.
// vars: { name: { value, secret? } }. Secrets go through a 0600 temp file, never argv.
export function runKane({ objective, url, vars, name, timeout = 420, headless = true, logFile, onEvent }) {
  const dir = mkdtempSync(join(tmpdir(), 'stranger-'))
  const varsFile = join(dir, 'vars.json')
  writeFileSync(varsFile, JSON.stringify(vars), { mode: 0o600 })

  const args = ['run', objective, '--agent', '--url', url, '--variables-file', varsFile, '--timeout', String(timeout), '--name', name]
  if (headless) args.push('--headless')

  return new Promise((resolvePromise) => {
    const started = Date.now()
    const child = spawn(process.env.KANE_CLI_BIN || 'kane-cli', args, {
      env: { ...process.env, KANE_CLI_USER_AGENT: 'stranger' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const events = []
    const raw = []
    let stderr = ''
    let buffer = ''

    child.stdout.on('data', (chunk) => {
      buffer += chunk
      let nl
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim()
        buffer = buffer.slice(nl + 1)
        if (!line) continue
        raw.push(line)
        try {
          const event = JSON.parse(line)
          events.push(event)
          onEvent?.(event)
        } catch {
          // Not JSON: keep it in raw for the log.
        }
      }
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
      if (stderr.length > 200_000) stderr = stderr.slice(-100_000)
    })

    const finish = (exitCode, spawnError) => {
      rmSync(dir, { recursive: true, force: true })
      if (buffer.trim()) raw.push(buffer.trim())
      if (logFile) writeFileSync(logFile, raw.join('\n') + '\n')
      const end = events.findLast((e) => kind(e) === 'run_end') ?? null
      resolvePromise({
        exitCode,
        spawnError: spawnError?.message ?? null,
        seconds: Math.round((Date.now() - started) / 1000),
        events,
        steps: events.filter((e) => e.step !== undefined),
        end,
        stderrTail: stderr.split('\n').slice(-15).join('\n'),
      })
    }
    child.on('error', (err) => finish(127, err))
    child.on('close', (code) => finish(code ?? 1))
  })
}

// The event name lives in "type" or "event" depending on the line.
export function kind(event) {
  if (!event || typeof event !== 'object') return null
  if (event.type) return event.type
  if (event.event) return event.event
  if ('result_code' in event && 'status' in event) return 'run_end'
  return null
}

export function passed(result) {
  return result.exitCode === 0 && (result.end?.status ?? 'passed') === 'passed'
}

// Plain text of everything Kane said about the run, for matching canary and control strings.
export function said(result) {
  const parts = []
  for (const e of result.steps) parts.push(e.remark, e.description, e.action, e.reason)
  if (result.end) parts.push(result.end.summary, result.end.one_liner, result.end.reason, result.end.final_state)
  return parts.filter((p) => typeof p === 'string').join('\n')
}
