#!/usr/bin/env node
// A stand-in for "kane-cli run ... --agent" that prints the same NDJSON shape as Kane 0.10.4 and writes
// a session folder with an evidence pack, so Stranger can be tested without spending Kane credits.
//
// FAKE_KANE_MODES: comma list, one mode per probe (probe n uses the n-th; one probe uses the first):
//   clean           stranger passes, and nothing of the owner's is in the network log
//   page-leak       stranger fails on the "canary does not appear" check
//   network-leak    stranger passes (page hid it), but an API response in the HAR carries the canary
//   control-missing stranger fails because its own record is not in the list
//   owner-fail      owner cannot plant the canary
//   no-credits      Kane does not start (exit 2)
//   link-leak       the list hides the canary, but the owner's record page (opened directly) shows it
// FAKE_KANE_LINK: an address the owner's run visits after saving (its evidence lists it in step.json).
// FAKE_KANE_RPC: a database function the stranger's page calls (POST /rest/v1/rpc/<name>).
// FAKE_KANE_BUCKET: a storage bucket the owner's page downloads from.
// FAKE_KANE_ONLY_RPC=1: the pages load everything through FAKE_KANE_RPC and send no GET reads.
// FAKE_KANE_DIR: where session folders and calls.log go. The owner's canary is written to planted.txt
//   there, so a test's stand-in API can hand it out.
// FAKE_KANE_API: base URL the logged data reads point at (a stand-in Supabase in the tests).
// FAKE_KANE_FORBID: a string that must never appear in argv (a password).
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'

const args = process.argv.slice(2)
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null)
const objective = args[1]
const name = flag('--name')
const out = process.env.FAKE_KANE_DIR
const emit = (obj) => process.stdout.write(JSON.stringify(obj) + '\n')

if (process.env.FAKE_KANE_FORBID && args.some((a) => a.includes(process.env.FAKE_KANE_FORBID))) {
  console.error('fake-kane: a secret was passed on the command line')
  process.exit(9)
}
// kane-cli testrun run <files...>: Stranger's guard tests, in the event shapes real Kane 0.10.5 printed.
// Logins come from Kane's variables folder in the working directory. Each test plants its canary as the
// owner (planted.txt) and passes or fails by mode:
//   clean           passes: Kane's checks see the control and not the canary; the recording is kept
//   page-leak       the real failing stream from a live run (fixtures/kane-testrun-leak.ndjson), with this
//                   test's marks swapped in: its summary names both the canary and the control
//   control-missing the stranger's own record is not on the page
//   step-fail       the owner cannot log out (step 2), so the stranger's look never happens
//   text-leak       an older, shorter stream: only a failure message naming the canary, no checks
// FAKE_KANE_LEAK_SECRET=1 writes a password into the recordings, as a careless recorder might.
if (args[0] === 'testrun') {
  const files = args.slice(2, args.findIndex((a, i) => i > 1 && a.startsWith('--')))
  const pool = JSON.parse(readFileSync(join(process.cwd(), '.testmuai', 'variables', 'stranger-guard.json'), 'utf8'))
  if (!pool.owner_password?.secret || !pool.stranger_password?.secret) {
    console.error('fake-kane: a password was not marked secret')
    process.exit(9)
  }
  const mode = (process.env.FAKE_KANE_MODES ?? 'clean').split(',')[0]
  appendFileSync(join(out, 'calls.log'), `testrun ${files.join(' ')} ${mode}\n`)
  appendFileSync(join(out, 'testrun-args.log'), args.join(' ') + '\n')
  const v = { v: 1 }
  emit({ type: 'stream_start', cli_version: '0.10.5', surface: 'testrun', ...v })
  emit({ type: 'testrun_plan', members: files.map((path) => ({ path: join(process.cwd(), path), tags: ['stranger', 'guard'] })), valid: true, parallel: 1, ...v })
  const check = (subject, mustBe, seen) => ({
    subject: `the text "${subject}"`,
    condition: mustBe === 'absent' ? `the text "${subject}" does not appear anywhere on the page` : `the text "${subject}" is visible on the page`,
    must_be: mustBe,
    operator: 'equals',
    extracted_value: String(seen),
    expected_value: String(mustBe === 'present'),
    reasoning: `value: '${seen}' -> '${seen}'; equals '${mustBe === 'present'}' -> ${seen === (mustBe === 'present') ? 'PASS' : 'FAIL'}`,
  })
  let failed = 0
  for (const file of files) {
    const path = join(process.cwd(), file)
    const text = readFileSync(path, 'utf8')
    const canary = text.match(/stranger-guard-[0-9a-f]{6}/)[0]
    const control = text.match(/stranger-own-[0-9a-f]{6}/)[0]
    const heads = [...text.matchAll(/^## (.+)$/gm)].map((m) => m[1])
    appendFileSync(join(out, 'planted.txt'), `${canary}\n`)
    const stem = file.replace(/_test\.md$/, '')
    const outDir = join(process.cwd(), `output-${stem}`)
    mkdirSync(join(outDir, '.internal'), { recursive: true })
    writeFileSync(join(outDir, 'Result.md'), `---\ntest: ../${file}\nstatus: ${mode === 'clean' ? 'passed' : 'failed'}\n---\n`)
    writeFileSync(join(outDir, '.internal', 'execution.json'), JSON.stringify({ typed: process.env.FAKE_KANE_LEAK_SECRET ? pool.owner_password.value : '{{owner_password}}' }))
    failed++
    if (mode === 'page-leak') {
      const real = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'kane-testrun-leak.ndjson'), 'utf8')
      for (const line of real.split('\n').filter(Boolean)) {
        const e = JSON.parse(line.replaceAll('stranger-guard-b661da', canary).replaceAll('stranger-own-b661da', control).replaceAll('main_test.md', file))
        if (['stream_start', 'testrun_plan', 'verdict', 'coverage', 'testrun_summary', 'testrun_done', 'testrun_evidence_ingest'].includes(e.type)) continue
        emit(e)
      }
      continue
    }
    if (mode === 'text-leak') {
      emit({ type: 'testrun_member_start', path: file, ...v })
      emit({ type: 'testrun_member_end', path: file, status: 'failed', failure: { message: `Final verification failed: "the text "${canary}" does not appear anywhere on the page"` }, ...v })
      continue
    }
    const recorded = existsSync(join(outDir, '.internal', 'committed'))
    const member = { index: 0, path }
    const inner = (event) => emit({ type: 'testrun_member_event', member, event: { ...event, ...v }, ...v })
    emit({ type: recorded ? 'testrun_member_start' : 'testrun_authored_member_start', path, ...v })
    const failAt = mode === 'step-fail' ? 2 : mode === 'control-missing' ? 4 : 0
    let reason = null
    for (let i = 1; i <= 4; i++) {
      inner({ type: 'test_md_step_start', step_index: i, heading: heads[i - 1] ?? null })
      const memory = i === 1 ? { a: check(canary, 'present', true) } : i === 4 ? { a: check(control, 'present', mode !== 'control-missing'), b: check(canary, 'absent', false) } : {}
      const bad = i === failAt
      reason = bad ? (i === 2 ? 'Could not find a way to log out' : `Final verification failed: "the text "${control}" is visible on the page"`) : null
      inner({ type: 'run_end', status: bad ? 'failed' : 'passed', reason: reason ?? 'Objective completed', context: { memory: bad || i !== 2 ? memory : {} }, credits_consumed: recorded ? 0.5 : 6 })
      inner({ type: 'test_md_step_end', step_index: i, status: bad ? 'failed' : 'passed', duration_s: 5 })
      if (bad) break
    }
    const ok = !failAt
    if (ok) {
      failed--
      writeFileSync(join(outDir, '.internal', 'committed'), '')
    }
    inner({ type: 'test_md_summary', overall_status: ok ? 'passed' : 'failed', steps: { total: 4, replay_decisions: recorded ? 4 : 0, author_decisions: recorded ? 0 : 4 }, commit: { committed: ok, ...(ok ? {} : { reason: 'run_failed' }) }, share_url: 'https://kane.example/share/guard' })
    inner({ type: 'test_md_done', overall_status: ok ? 'passed' : 'failed', share_url: 'https://kane.example/share/guard' })
    emit({ type: recorded ? 'testrun_member_end' : 'testrun_authored_member_end', path: file, status: ok ? 'passed' : 'failed', ...(ok ? {} : { failure: { message: reason, step_index: failAt } }), ...v })
  }
  const pack = join(process.cwd(), '.testmuai', 'evidence', 'run-1.evidence')
  emit({ type: 'coverage', status: 'skipped', reason: 'not_assurance_project', pack, ...v })
  emit({ type: 'verdict', result: failed ? 'fail' : 'pass', exit_code: failed ? 1 : 0, policies: [{ id: 'stranger-guard', result: failed ? 'fail' : 'pass', failed_gate_ids: failed ? ['no-leak-came-back'] : [] }], ...v })
  emit({ type: 'testrun_summary', execution: { id: 'run-1', status: failed ? 'failed' : 'passed', evidence_id: 'run-1' }, totals: { tests: files.length, passed: files.length - failed, failed, broken: 0 }, ...v })
  emit({ type: 'testrun_done', execution_id: 'run-1', overall_status: failed ? 'failed' : 'passed', ...v })
  process.exit(failed ? 1 : 0)
}

const vars = JSON.parse(readFileSync(flag('--variables-file'), 'utf8'))
if (!vars.password?.secret) {
  console.error('fake-kane: password was not marked secret')
  process.exit(9)
}

const canary = objective.match(/stranger-canary-[0-9a-f]+(?:-\d+)?/)[0]
const control = objective.match(/stranger-control-[0-9a-f]+(?:-\d+)?/)?.[0]
const probe = Number(canary.match(/^stranger-canary-[0-9a-f]{6}-(\d+)$/)?.[1] ?? 1)
const modes = (process.env.FAKE_KANE_MODES ?? 'clean').split(',')
const mode = modes[probe - 1] ?? modes[0]
const role = name.startsWith('stranger-owner-') ? 'owner' : 'stranger'
appendFileSync(join(out, 'calls.log'), `${role} ${probe} ${mode}\n`)
appendFileSync(join(out, 'objectives.log'), `${role}: ${objective}\n`)

if (mode === 'no-credits') {
  console.error('Insufficient credits')
  process.exit(2)
}

const session = join(out, `session-${randomBytes(4).toString('hex')}`)
mkdirSync(join(session, 'evidence'), { recursive: true })
const testUrl = `https://kane.example/share/${name}`

// The evidence pack is a zip holding logs/0-network.har and one step.json per step, like Kane's.
function pack(entries, urls = []) {
  const tmp = join(session, 'pack')
  mkdirSync(join(tmp, 'logs'), { recursive: true })
  writeFileSync(join(tmp, 'logs', '0-network.har'), JSON.stringify({ log: { entries } }))
  writeFileSync(join(tmp, 'logs', 'kane.log'), `objective: ${objective}\n`) // quotes the canary; must not count
  urls.forEach((url, i) => {
    mkdirSync(join(tmp, 'tests', 'run', 'steps', String(i + 1)), { recursive: true })
    writeFileSync(join(tmp, 'tests', 'run', 'steps', String(i + 1), 'step.json'), JSON.stringify({ ordinal: i + 1, url, summary: `step ${i + 1}`, status: 'passed' }))
  })
  execFileSync('zip', ['-qr', join(session, 'evidence', 'run.evidence'), 'logs', ...(urls.length ? ['tests'] : [])], { cwd: tmp })
  rmSync(tmp, { recursive: true, force: true })
}
// Like real Kane 0.10.4: the request is logged in full (headers, bearer token), the response body
// is not. Only "network-leak" keeps a body, to cover a Kane that someday does.
const API = process.env.FAKE_KANE_API ?? 'http://127.0.0.1:9'
// FAKE_KANE_STRANGER_TABLE: the table the stranger's page reads (default invoices).
// FAKE_KANE_TOTALS=1: the stranger's page also reads /rest/v1/totals (a count, for the numeric canary).
// FAKE_KANE_FILTERED=1: only the stranger's page logs a read, filtered to that account.
const filtered = process.env.FAKE_KANE_FILTERED === '1'
const token = `test.${Buffer.from(JSON.stringify({ sub: role })).toString('base64url')}.signature`
const read = (table, rows) => ({
  request: {
    method: 'GET',
    url: `${API}/rest/v1/${table}?select=*&order=created_at.desc${filtered ? '&user_id=eq.stranger' : ''}`,
    headers: [
      { name: 'apikey', value: 'public-anon-key' },
      { name: 'Authorization', value: `Bearer ${token}` },
      { name: 'Accept-Profile', value: 'public' },
    ],
  },
  response: { status: 200, content: mode === 'network-leak' ? { text: JSON.stringify(rows) } : { size: -1 } },
})
const headers = [
  { name: 'apikey', value: 'public-anon-key' },
  { name: 'Authorization', value: `Bearer ${token}` },
]
const api = (rows) => {
  if (process.env.FAKE_KANE_ONLY_RPC === '1') return [{ request: { method: 'POST', url: `${API}/rest/v1/rpc/${process.env.FAKE_KANE_RPC}`, headers }, response: { status: 200, content: { size: -1 } } }]
  if (role === 'owner') {
    const out = filtered ? [] : [read('invoices', rows)]
    const bucket = process.env.FAKE_KANE_BUCKET
    if (bucket) out.push({ request: { method: 'GET', url: `${API}/storage/v1/object/authenticated/${bucket}/owner/receipt.txt`, headers }, response: { status: 200, content: { size: -1 } } })
    return out
  }
  const out = [read(process.env.FAKE_KANE_STRANGER_TABLE || 'invoices', rows)]
  if (process.env.FAKE_KANE_TOTALS) out.push(read('totals', []))
  const rpc = process.env.FAKE_KANE_RPC
  if (rpc) out.push({ request: { method: 'POST', url: `${API}/rest/v1/rpc/${rpc}`, headers }, response: { status: 200, content: { size: -1 } } })
  return out
}

const steps = [
  { step: 1, status: 'done', remark: `navigate: ${flag('--url')}` },
  { step: 2, status: 'done', remark: 'type: {{global.email}} into Email' },
  { step: 3, status: 'done', remark: `type: ${role === 'owner' ? canary : control} into Note` },
]
for (const s of steps) emit(s)

function end(status, extra, code) {
  emit({ type: 'run_end', status, test_url: testUrl, session_dir: session, credits_consumed: 1.5, result_code: status === 'passed' ? 100 : 200, ...extra })
  process.exit(code)
}

if (role === 'owner') {
  appendFileSync(join(out, 'planted.txt'), `${canary}\n`)
  pack(api([{ note: canary }]), [flag('--url'), ...(process.env.FAKE_KANE_LINK ? [process.env.FAKE_KANE_LINK] : [])])
  if (mode === 'owner-fail') {
    emit({ step: 4, status: 'failed', remark: 'click: New invoice button not found' })
    end('failed', { one_liner: 'could not find New invoice', reason: 'New invoice button not found' }, 1)
  }
  emit({ step: 4, status: 'done', remark: `assert: the text "${canary}" is visible` })
  end('passed', { one_liner: 'created and saved an invoice' }, 0)
}

const own = { note: control }
const theirs = { note: canary, client_name: 'Synthetic HAR Client' }
if (mode === 'page-leak') {
  pack(api([own, theirs]))
  emit({ step: 5, status: 'done', remark: `assert: the text "${control}" is visible on the page` })
  emit({ step: 6, status: 'failed', remark: `assert: the text "${canary}" does not appear anywhere on the page` })
  end('failed', { one_liner: 'The final check failed because the canary text was present.', reason: 'canary visible' }, 1)
}
if (mode === 'network-leak') {
  pack(api([own, theirs]))
  emit({ step: 5, status: 'done', remark: `assert: the text "${control}" is visible on the page` })
  emit({ step: 6, status: 'done', remark: `assert: the text "${canary}" does not appear anywhere on the page` })
  end('passed', { one_liner: 'the stranger saw only their own invoice' }, 0)
}
if (mode === 'link-leak') {
  pack(api([own]))
  emit({ step: 5, status: 'done', remark: `assert: the text "${control}" is visible on the page` })
  emit({ step: 6, status: 'done', remark: `assert: the text "${canary}" does not appear anywhere on the page` })
  if (/go directly to/.test(objective)) {
    emit({ step: 7, status: 'done', remark: `navigate: ${objective.match(/go directly to (\S+)/)[1]}` })
    emit({ step: 8, status: 'failed', remark: `assert: the text "${canary}" is not shown on that page either` })
    end('failed', { one_liner: "The canary showed on the owner's record page.", reason: 'canary visible on the record page' }, 1)
  }
  end('passed', { one_liner: 'the stranger saw only their own invoice' }, 0)
}
if (mode === 'control-missing') {
  pack(api([]))
  emit({ step: 5, status: 'failed', remark: `assert: the text "${control}" is visible on the page` })
  end('failed', { one_liner: 'own invoice not listed', reason: 'control not visible' }, 1)
}
pack(api([own]))
emit({ step: 5, status: 'done', remark: `assert: the text "${control}" is visible on the page` })
emit({ step: 6, status: 'done', remark: `assert: the text "${canary}" does not appear anywhere on the page` })
end('passed', { one_liner: 'the stranger saw only their own invoice' }, 0)
