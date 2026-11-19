import { spawn } from 'node:child_process'
import { writeFileSync, rmSync, mkdtempSync } from 'node:fs'
import { basename, join } from 'node:path'
import { tmpdir } from 'node:os'

// Runs one Kane CLI objective in agent mode and collects its NDJSON stream.
// vars: { name: { value, secret? } }. Secrets go through a 0600 temp file, never argv.
export async function runKane({ objective, url, vars, name, timeout = 420, headless = true, cwd, logFile, onEvent }) {
  const dir = mkdtempSync(join(tmpdir(), 'stranger-'))
  const varsFile = join(dir, 'vars.json')
  writeFileSync(varsFile, JSON.stringify(vars), { mode: 0o600 })

  const args = ['run', objective, '--agent', '--url', url, '--variables-file', varsFile, '--timeout', String(timeout), '--name', name]
  if (headless) args.push('--headless')
  try {
    const r = await spawnKane(args, { cwd, logFile, onEvent })
    return { ...r, steps: r.events.filter((e) => e.step !== undefined), end: r.events.findLast((e) => kind(e) === 'run_end') ?? null }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// Runs Kane test files (*_test.md) as one execution with kane-cli testrun: one sealed evidence pack,
// judged by a verdict policy. Recorded tests replay without the LLM; Kane authors any that are new.
// Each member's own events come on stdout too (--stream-members), so failed checks can be read.
export async function runKaneSuite({ cwd, paths, policy, headless = true, startUrl, timeout, logFile, onEvent }) {
  const args = ['testrun', 'run', ...paths, '--agent', '--stream-members']
  if (policy) args.push('--policy', policy)
  if (headless) args.push('--headless')
  if (startUrl) args.push('--override-start-url', startUrl)
  const r = await spawnKane(args, { cwd, logFile, onEvent, timeout })
  const done = r.events.findLast((e) => kind(e) === 'testrun_done') ?? null
  const members = {}
  const memberOf = (path) => {
    const key = basename(String(path))
    return (members[key] ??= { file: key, status: null, step: null, failure: null, checks: [], bugs: [], testUrl: null, recorded: null, authored: null, replayed: null, credits: 0 })
  }
  const failures = []
  let credits = 0
  let testUrl = null
  let pack = null
  let verdict = null
  for (const e of r.events) {
    const type = kind(e)
    const inner = e.event && typeof e.event === 'object' ? e.event : e.data && typeof e.data === 'object' ? e.data : e
    const path = [e.member?.path, e.member, e.path, e.member_key, inner.member, inner.path, inner.test].find((x) => typeof x === 'string') ?? null
    const m = path && /_test\.md$/.test(path) ? memberOf(path) : null
    if (typeof inner.credits_consumed === 'number') {
      credits += inner.credits_consumed
      if (m) m.credits += inner.credits_consumed
    }
    testUrl = inner.share_url ?? inner.test_url ?? e.test_url ?? testUrl
    if (m) {
      const t = kind(inner)
      if (t === 'test_md_step_start') m.step = { index: inner.step_index, heading: inner.heading ?? null }
      if (t === 'run_end') {
        // Kane's own checks for this step: what it looked for, whether it had to be there, and the outcome.
        for (const c of Object.values(inner.context?.memory ?? {})) {
          if (c && typeof c === 'object') m.checks.push({ step: m.step?.index ?? null, subject: c.subject ?? null, condition: c.condition ?? c.query ?? null, mustBe: c.must_be ?? null, passed: checkPassed(c) })
        }
        if (inner.status === 'failed') m.failure ??= { step: m.step?.index ?? null, heading: m.step?.heading ?? null, message: inner.reason ?? null }
      }
      if (t === 'test_md_bug_verdict' && inner.confirmed !== false) m.bugs.push({ step: inner.step_index ?? null, title: inner.bug_title ?? inner.one_liner ?? null, confidence: inner.confidence ?? null })
      if (t === 'test_md_summary') {
        m.recorded = inner.commit?.committed ?? null
        m.authored = inner.steps?.author_decisions ?? null
        m.replayed = inner.steps?.replay_decisions ?? null
      }
      if (t === 'test_md_summary' || t === 'test_md_done') {
        m.testUrl = inner.share_url ?? m.testUrl
        m.status ??= inner.overall_status ?? null
      }
      if (type === 'testrun_authored_member_end' || type === 'testrun_member_end') {
        m.status = e.status ?? m.status
        if (e.failure) m.failure = { ...m.failure, step: e.failure.step_index ?? m.failure?.step ?? null, message: e.failure.message ?? m.failure?.message ?? null }
      }
    }
    if (type === 'coverage' && typeof e.pack === 'string') pack = e.pack
    if (type === 'testrun_summary' && !pack && e.execution?.evidence_id) pack = join(cwd, '.testmuai', 'evidence', `${e.execution.evidence_id}.evidence`)
    if (type === 'verdict') verdict = { result: e.result ?? null, failedGates: (e.policies ?? []).flatMap((p) => p.failed_gate_ids ?? []), file: e.policies?.[0]?.file ?? null }
    // Older or shorter streams: a failed status with a message somewhere in the event.
    if (['failed', 'broken', 'fail', 'error'].includes(inner.status ?? inner.outcome)) {
      const text = [inner.remark, inner.reason, inner.message, inner.error, e.failure?.message].filter((x) => typeof x === 'string').join(' ')
      failures.push({ member: path, text })
    }
  }
  return {
    ...r,
    done,
    members,
    failures,
    credits: credits ? Math.round(credits * 100) / 100 : null,
    testUrl: done?.test_url ?? testUrl,
    pack: pack ?? done?.evidence ?? null,
    policy: verdict ?? done?.verdicts ?? null,
    reason: done?.reason ?? r.spawnError ?? (r.exitCode && r.exitCode !== 1 ? r.stderrTail.trim().split('\n').at(-1) : null),
  }
}

// One of Kane's checks passed or failed. Its reasoning ends in "-> PASS" or "-> FAIL".
function checkPassed(c) {
  const verdict = /->\s*(PASS|FAIL)\s*$/.exec(c.reasoning ?? '')
  if (verdict) return verdict[1] === 'PASS'
  if (c.operator === 'equals' && c.extracted_value != null && c.expected_value != null) return String(c.extracted_value) === String(c.expected_value)
  return null
}

// Starts kane-cli with stdin closed (so it never waits for an answer) and collects its NDJSON stream.
function spawnKane(args, { cwd, logFile, onEvent, timeout }) {
  return new Promise((resolvePromise) => {
    const started = Date.now()
    const child = spawn(process.env.KANE_CLI_BIN || 'kane-cli', args, {
      cwd,
      env: { ...process.env, KANE_CLI_USER_AGENT: 'stranger' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const timer = timeout ? setTimeout(() => child.kill('SIGTERM'), timeout * 1000) : null
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

    let finished = false
    const finish = (exitCode, spawnError) => {
      if (finished) return
      finished = true
      if (timer) clearTimeout(timer)
      if (buffer.trim()) raw.push(buffer.trim())
      if (logFile) writeFileSync(logFile, raw.join('\n') + '\n')
      resolvePromise({
        exitCode,
        spawnError: spawnError?.message ?? null,
        seconds: Math.round((Date.now() - started) / 1000),
        events,
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
