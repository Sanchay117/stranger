// The no-human fix loop for one pull request (run by .github/workflows/stranger-fix.yml).
//
// 1. Stranger checks the app at APP_URL, built from this branch and backed by the preview database.
// 2. On LEAK, TAMPER or OVERLOCKED (and when ALLOW_AGENT is not "false"), Claude Code gets the fix brief
//    with Stranger's Stop hook armed. It writes a migration and applies it to the preview database. When
//    it stops, the hook runs Stranger again with a fresh canary, and blocks it until Stranger says CLEAN
//    (or the hook's own limits let it go).
// 3. Writes fix-loop.json (for the workflow) and fix-loop.md (the pull request comment) in the root.
//
// The workflow, not the agent, commits and pushes, and only migrations and Stranger's tracked files.
// Env: APP_URL (required), PREVIEW_DB_URL (the agent's db:apply goes there), OWNER_* and STRANGER_*,
// ANTHROPIC_API_KEY, ALLOW_AGENT, CLAUDE_BIN (default "claude"), RUN_URL (link to the CI run).
// Usage: node scripts/fix-loop.mjs [--root <dir>]
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

const { values } = parseArgs({ options: { root: { type: 'string', default: process.cwd() } } })
const root = resolve(values.root)
const STRANGER = new URL('../stranger/bin/stranger.js', import.meta.url).pathname
const FAILING = new Set(['LEAK', 'TAMPER', 'OVERLOCKED'])

if (!process.env.APP_URL) {
  console.error('APP_URL is not set')
  process.exit(3)
}
const config = JSON.parse(readFileSync(join(root, 'stranger.config.json'), 'utf8'))
const migrations = config.migrations ?? 'supabase/migrations'

// Every Stranger run here, including the hook's, checks APP_URL and writes to the preview database.
const env = { ...process.env, DUEBOOK_URL: process.env.APP_URL }
if (process.env.PREVIEW_DB_URL) env.SUPABASE_DB_URL = process.env.PREVIEW_DB_URL
else delete env.SUPABASE_DB_URL

function run(cmd, args, opts = {}) {
  return new Promise((done) => {
    const child = spawn(cmd, args, { cwd: root, env, stdio: ['ignore', 'pipe', 'inherit'], ...opts })
    let out = ''
    child.stdout.on('data', (d) => {
      out += d
      opts.echo?.(d)
    })
    child.on('error', (err) => done({ code: null, out, error: err.message }))
    child.on('close', (code) => done({ code, out }))
  })
}

const last = () => {
  try {
    return JSON.parse(readFileSync(join(root, '.stranger', 'last.json'), 'utf8'))
  } catch {
    return null
  }
}
const credits = (r) => Math.round(((r?.ownerRun?.credits ?? 0) + (r?.strangerRun?.credits ?? 0)) * 10) / 10
const brief = (r) => (r ? { id: r.id, verdict: r.verdict, why: r.why, canary: r.canary, run: r.strangerRun?.testUrl ?? null, credits: credits(r) } : null)
const sqlFiles = () => (existsSync(join(root, migrations)) ? readdirSync(join(root, migrations)).filter((f) => f.endsWith('.sql')).sort() : [])

console.log(`Stranger checks ${process.env.APP_URL}`)
await run(process.execPath, [STRANGER, 'run', '--json'])
const before = last()
const summary = { before: brief(before), agent: { ran: false }, after: null, final: before?.verdict ?? 'INCONCLUSIVE', push: false, migrations: [] }

if (before && FAILING.has(before.verdict) && process.env.ALLOW_AGENT !== 'false') {
  const had = new Set(sqlFiles())
  mkdirSync(join(root, '.stranger', 'runs'), { recursive: true })
  writeFileSync(join(root, '.stranger', 'armed'), '')
  rmSync(join(root, '.stranger', 'hook-state.json'), { force: true })
  // npm run db:apply loads .env; in CI the values come from the environment, so an empty one will do.
  if (!existsSync(join(root, '.env'))) writeFileSync(join(root, '.env'), '')

  const prompt = [
    "Stranger, a check that signs in to this pull request's app as a second account with Kane CLI, found a problem.",
    'The fix brief is .stranger/FIX.md and the full report is .stranger/report.md.',
    '',
    `Fix it at the database: write one new migration in ${migrations}/ (the next number; never edit an applied one) and apply it with \`npm run db:apply\`.`,
    "The database here is this pull request's own preview database, so applying the migration is expected and safe.",
    'Do not change the app code to hide rows, do not run demo:reset, and do not commit or push: the workflow commits your migration once Stranger says CLEAN.',
    '',
    'When you stop, a hook runs Stranger again with a fresh canary. If it still finds a problem it tells you what, so fix that too. You are done when it says CLEAN.',
  ].join('\n')
  const log = join(root, '.stranger', 'runs', `agent-${Date.now()}.jsonl`)
  console.log(`\n${before.verdict}: handing .stranger/FIX.md to the coding agent (log: ${log})`)
  const agent = await run(
    process.env.CLAUDE_BIN || 'claude',
    [
      '-p',
      prompt,
      '--output-format',
      'stream-json',
      '--verbose',
      '--max-turns',
      '40',
      '--permission-mode',
      'acceptEdits',
      '--allowedTools',
      'Read,Edit,Write,Glob,Grep,Bash(npm run db:apply),Bash(git status),Bash(git diff:*),Bash(ls:*)',
    ],
    { timeout: 45 * 60 * 1000 },
  )
  writeFileSync(log, agent.out)
  rmSync(join(root, '.stranger', 'armed'), { force: true })

  // What the agent said last, for the comment (its final "result" line).
  let said = null
  for (const line of agent.out.split('\n')) {
    try {
      const m = JSON.parse(line)
      if (m.type === 'result' && typeof m.result === 'string') said = m.result
    } catch {}
  }
  const after = last()
  summary.agent = { ran: true, exit: agent.code, error: agent.error ?? null, said: said?.slice(0, 1500) ?? null }
  summary.migrations = sqlFiles().filter((f) => !had.has(f))
  // The hook's own re-run, if there was one (a fresh canary means a new Stranger run).
  summary.after = after && after.id !== before.id ? brief(after) : null
  summary.final = summary.after?.verdict ?? before.verdict
  summary.push = summary.final === 'CLEAN' && summary.migrations.length > 0
}

writeFileSync(join(root, 'fix-loop.json'), JSON.stringify(summary, null, 2) + '\n')
writeFileSync(join(root, 'fix-loop.md'), comment(summary))
console.log(`\nFix loop: ${summary.before?.verdict ?? 'no result'}${summary.after ? ` -> ${summary.after.verdict}` : ''}${summary.migrations.length ? `, new migration ${summary.migrations.join(', ')}` : ''}`)
process.exit(summary.final === 'CLEAN' ? 0 : 1)

function comment(s) {
  const icon = { CLEAN: '✅', LEAK: '🚨', TAMPER: '🚨', OVERLOCKED: '⚠️', INCONCLUSIVE: '❔' }
  const line = (label, r) => (r ? `**${label}: ${icon[r.verdict] ?? ''} ${r.verdict}** (canary \`${r.canary}\`${r.credits ? `, ${r.credits} Kane credits` : ''})${r.run ? ` [Kane run](${r.run})` : ''}\n\n${r.why}` : `**${label}:** no result`)
  const out = ['<!-- stranger-fix -->', '### Stranger fix loop', '', line('Before', s.before), '']
  if (!s.agent.ran) {
    out.push(s.before && FAILING.has(s.before.verdict) ? 'The coding agent did not run (this branch already has two fix-loop commits, or the loop is off).' : 'Nothing to fix.')
  } else {
    out.push(`The coding agent (Claude Code, headless in CI) got \`.stranger/FIX.md\` with Stranger's Stop hook armed.`, '')
    for (const name of s.migrations) {
      let sql = ''
      try {
        sql = readFileSync(join(root, migrations, name), 'utf8')
      } catch {}
      out.push(`<details><summary>It wrote <code>${migrations}/${name}</code> and applied it to the preview database</summary>\n\n\`\`\`sql\n${sql.trim()}\n\`\`\`\n</details>`, '')
    }
    if (!s.migrations.length) out.push('It wrote no migration.', '')
    if (s.agent.said) out.push(`<details><summary>What the agent said when it stopped</summary>\n\n${s.agent.said.split('\n').map((l) => `> ${l}`).join('\n')}\n</details>`, '')
    out.push(s.after ? line("After (the Stop hook's re-run, fresh canary)", s.after) : '**After:** Stranger did not run again (the agent stopped without changing a watched file).', '')
    out.push(s.push ? 'The migration is committed to this branch by the workflow.' : 'Nothing was committed: Stranger did not say CLEAN, so a person should look.')
  }
  if (process.env.RUN_URL) out.push('', `[Workflow run](${process.env.RUN_URL})`)
  return out.join('\n') + '\n'
}
