// Turns one real Stranger run into the replay the landing page plays.
// Usage: node scripts/export-replay.mjs <run id suffix, e.g. afb57e>
// Writes demo/site/replay-<id>.json. Remarks never contain secrets: Kane shows variables as {{placeholders}}.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const id = process.argv[2]
if (!id) {
  console.error('usage: node scripts/export-replay.mjs <run id>')
  process.exit(2)
}
const runs = '.stranger/runs'
const dir = readdirSync(runs).find((d) => d.endsWith(id))
if (!dir) throw new Error(`no run ending in ${id}`)
const result = JSON.parse(readFileSync(join(runs, dir, 'result.json'), 'utf8'))

const tidy = (remark) =>
  remark
    .replace(/^wait: PRIMARY: /, 'wait: ')
    .replace(/\{\{global\.email\}\}/g, 'the email')
    .replace(/\{\{secrets\.[a-z.]+\}\}/g, 'the password')

function steps(file) {
  const lines = readFileSync(join(runs, dir, file), 'utf8').split('\n').filter(Boolean)
  const out = []
  for (const line of lines) {
    let e
    try {
      e = JSON.parse(line)
    } catch {
      continue
    }
    if (e.step === undefined || !e.remark) continue
    if (e.status !== 'done' && e.status !== 'failed') continue
    if (/^(wait: queued plan|analyze: ANALYZE|scroll:)/.test(e.remark)) continue
    out.push({ ok: e.status === 'done', text: tidy(e.remark) })
  }
  return out
}

const run = (r) => ({ status: r.status, seconds: r.seconds, credits: Math.round(r.credits * 10) / 10, testUrl: r.testUrl })

const replay = {
  id: result.id,
  at: result.startedAt,
  verdict: result.verdict,
  why: result.why,
  canary: result.canary,
  control: result.control,
  owner: result.owner,
  stranger: result.stranger,
  ownerRun: { ...run(result.ownerRun), steps: steps('owner.ndjson') },
  strangerRun: result.strangerRun ? { ...run(result.strangerRun), steps: steps('stranger.ndjson') } : null,
}

const out = `demo/site/replay-${result.id}.json`
writeFileSync(out, JSON.stringify(replay, null, 2) + '\n')
console.log(`wrote ${out}: ${replay.ownerRun.steps.length} + ${replay.strangerRun?.steps.length ?? 0} steps, ${replay.verdict}`)
