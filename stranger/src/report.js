import { appendFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const HINTS = {
  supabase: (cfg, table = '<table>') => [
    'This app reads its data straight from Supabase, so the database decides who sees which rows (Row Level Security).',
    '',
    'Find the SELECT policy on the leaking table. A policy like `using (true)` ("Enable read access for all users") lets every account, and anyone holding the public anon key, read every row.',
    '',
    'Replace it with a policy that only returns the signed-in user\'s rows, for example:',
    '',
    '```sql',
    `drop policy if exists "Enable read access for all users" on public.${table};`,
    `create policy "Owners can read their own rows" on public.${table}`,
    '  for select to authenticated',
    '  using ((select auth.uid()) = user_id);',
    '```',
    '',
    cfg.migrations
      ? `Write it as a new migration in \`${cfg.migrations}/\` (never edit an applied one), apply it, and check UPDATE and DELETE policies on the same table too.`
      : 'Apply it as a new migration, and check UPDATE and DELETE policies on the same table too.',
  ],
  firebase: () => [
    'This app reads its data from Firebase, so Security Rules decide who sees which documents.',
    '',
    'Find the rule that allows reads on the leaking collection and limit it to the owner, for example `allow read: if request.auth.uid == resource.data.userId;`.',
  ],
  unknown: () => [
    'The server returns records that belong to another account. Add an ownership check where the data is loaded on the server (or in the database), so each request only returns the signed-in user\'s records.',
  ],
}

export function writeReport(cfg, result) {
  const dir = join(cfg.root, '.stranger')
  mkdirSync(dir, { recursive: true })
  const fixPath = join(dir, 'FIX.md')
  const reportPath = join(dir, 'report.md')

  writeFileSync(join(result.runDir, 'result.json'), JSON.stringify(result, null, 2) + '\n')
  writeFileSync(join(dir, 'last.json'), JSON.stringify(result, null, 2) + '\n')
  appendFileSync(
    join(dir, 'history.jsonl'),
    JSON.stringify({
      at: result.startedAt,
      id: result.id,
      verdict: result.verdict,
      why: result.why,
      url: result.url,
      ownerRun: result.ownerRun?.testUrl ?? null,
      strangerRun: result.strangerRun?.testUrl ?? null,
      credits: (result.ownerRun?.credits ?? 0) + (result.strangerRun?.credits ?? 0),
    }) + '\n',
  )
  writeFileSync(reportPath, report(cfg, result))

  if (result.verdict === 'LEAK') writeFileSync(fixPath, fix(cfg, result))
  else if (result.verdict === 'CLEAN') rmSync(fixPath, { force: true })

  return {
    report: relative(process.cwd(), reportPath) || reportPath,
    fix: result.verdict === 'LEAK' ? relative(process.cwd(), fixPath) || fixPath : null,
  }
}

function runLines(label, run) {
  if (!run) return [`- ${label}: did not run`]
  return [
    `- ${label}: **${run.status}** in ${run.seconds}s${run.credits != null ? `, ${run.credits} credits` : ''}`,
    run.oneLiner ? `  - Kane: ${run.oneLiner}` : null,
    run.failedStep ? `  - Failed at step ${run.failedStep.step}: ${run.failedStep.remark ?? ''}` : null,
    run.testUrl ? `  - Run: ${run.testUrl}` : null,
    run.sessionDir ? `  - Evidence: \`${run.sessionDir}\`` : null,
  ].filter(Boolean)
}

function report(cfg, r) {
  return [
    `# Stranger: ${r.verdict}`,
    '',
    r.why,
    '',
    `- App: ${r.url}`,
    `- Owner: ${r.owner} planted \`${r.canary}\``,
    `- Stranger: ${r.stranger} looked for it (control \`${r.control}\`)`,
    `- When: ${r.startedAt}`,
    '',
    '## Kane runs',
    ...runLines('Owner plants the canary', r.ownerRun),
    ...runLines('Stranger looks for it', r.strangerRun),
    '',
    ...(r.evidence?.length
      ? ['## Found in the evidence pack', ...r.evidence.map((h) => `- ${h.url ? `${h.url} in ` : ''}\`${h.where}\`: …${h.snippet}…`), '']
      : []),
  ].join('\n')
}

function fix(cfg, r) {
  const where = r.evidence?.find((h) => h.url)?.url
  const table = where?.match(/\/rest\/v1\/([A-Za-z0-9_]+)/)?.[1] ?? (r.tables?.length === 1 ? r.tables[0] : undefined)
  const hints = (HINTS[cfg.database] ?? HINTS.unknown)(cfg, table)
  return [
    '# Stranger found a data leak',
    '',
    `Signed in as **${r.stranger}**, Kane could see a record that only **${r.owner}** created.`,
    '',
    `- Canary the owner planted: \`${r.canary}\``,
    `- How it showed up: ${r.seen === 'network' ? 'in a server response the browser received' : 'on the page'}`,
    where ? `- Response that carried it: ${where}${table ? ` (table \`${table}\`)` : ''}` : null,
    !where && r.tables?.length ? `- Tables the stranger's page read: ${r.tables.map((t) => `\`${t}\``).join(', ')}` : null,
    r.strangerRun?.failedStep ? `- Kane's failing check: ${r.strangerRun.failedStep.remark}` : null,
    r.strangerRun?.testUrl ? `- Kane run: ${r.strangerRun.testUrl}` : null,
    `- Full report: .stranger/report.md`,
    '',
    '## What to fix',
    '',
    ...hints,
    '',
    'Do not fix this by filtering rows in the page or the client code. The data still reaches the browser, and anyone can call the API directly.',
    '',
    '## Done means',
    '',
    'Run `stranger run` again. It plants a fresh canary each time. The fix is done when it prints CLEAN.',
    '',
  ]
    .filter((line) => line !== null)
    .join('\n')
}
