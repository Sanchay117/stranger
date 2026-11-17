import { appendFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { homedir } from 'node:os'
import { readPolicies } from './policies.js'

// Reports get committed, so local paths show as ~/... instead of naming the user's home folder.
const tidy = (text) => text.split(homedir()).join('~')

const HINTS = {
  supabase: (cfg, table) => {
    const known = table ?? '<table>'
    const found = table && cfg.migrations ? readPolicies(join(cfg.root, cfg.migrations), table) : null
    const col = found?.ownerColumn ?? 'user_id'
    const open = found?.select.filter((p) => p.open) ?? []
    const lines = ['This app reads its data straight from Supabase, so the database decides who sees which rows (Row Level Security).', '']

    if (found?.files && found.rls === false) {
      lines.push(`Your migrations turn Row Level Security **off** for \`${table}\`, so every account can read every row. Turn it on (\`alter table public.${table} enable row level security;\`) and add owner-only policies.`, '')
    } else if (found?.files && found.rls === null) {
      lines.push(`Your migrations in \`${cfg.migrations}/\` never turn on Row Level Security for \`${table}\`. Unless it was turned on in the dashboard, every account can read every row.`, '')
    }
    if (found?.select.length) {
      lines.push(`Read (SELECT) policies on \`${table}\`, as your migrations in \`${cfg.migrations}/\` leave them:`, '')
      for (const p of found.select) {
        lines.push(`- \`"${p.name}"\` (${p.file}, for ${p.command} to ${p.roles}): \`using (${p.using ?? '?'})\`${p.open ? ' **This lets every account read every row.**' : ''}`)
      }
      lines.push('')
    }
    if (found?.files && !open.length && found.rls !== false) {
      lines.push(
        found.select.length
          ? 'None of these looks open at a glance, so check what else can return these rows: a wider condition in one of them, a view, a `security definer` function, or a policy added in the dashboard (compare with `select * from pg_policies where tablename = \'' + table + '\'`).'
          : `No read policy on \`${table}\` was found in the migrations, so it may have been added in the dashboard. List the live ones with \`select * from pg_policies where tablename = '${table}'\`.`,
        '',
      )
    }

    lines.push(
      open.length ? 'Replace the open policy with one that only returns the signed-in user\'s rows:' : 'Each account should only get its own rows back, for example:',
      '',
      '```sql',
      ...(open.length ? open : [{ name: 'Enable read access for all users' }]).map((p) => `drop policy if exists "${p.name}" on public.${known};`),
      `create policy "Owners can read their own rows" on public.${known}`,
      '  for select to authenticated',
      `  using ((select auth.uid()) = ${col});`,
      '```',
      '',
      cfg.migrations
        ? `Write it as a new migration in \`${cfg.migrations}/\` (never edit an applied one), apply it, and check UPDATE and DELETE policies on the same table too.`
        : 'Apply it as a new migration, and check UPDATE and DELETE policies on the same table too.',
    )
    return lines
  },
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
      credits: (result.probes?.length ? result.probes : [result]).reduce((sum, p) => sum + (p.ownerRun?.credits ?? 0) + (p.strangerRun?.credits ?? 0), 0),
      ...(result.probes?.length > 1 ? { probes: result.probes.map((p) => ({ name: p.probe, verdict: p.verdict, canary: p.canary })) } : {}),
    }) + '\n',
  )
  writeFileSync(reportPath, tidy(report(cfg, result)))

  if (result.verdict === 'LEAK') writeFileSync(fixPath, tidy(fix(cfg, result)))
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
  const probes = r.probes?.length ? r.probes : [r]
  const multi = probes.length > 1
  const lines = [`# Stranger: ${r.verdict}`, '', r.why, '', `- App: ${r.url}`]
  if (!multi) {
    lines.push(`- Owner: ${r.owner} planted \`${r.canary}\``, `- Stranger: ${r.stranger} looked for it (control \`${r.control}\`)`)
  } else {
    lines.push(`- Owner: ${r.owner} planted one canary per probe`, `- Stranger: ${r.stranger} looked for each one`)
  }
  lines.push(`- When: ${r.startedAt}`, '')
  if (multi) {
    lines.push('## Probes', ...probes.map((p) => `- **${p.probe}**: ${p.verdict}, canary \`${p.canary}\`. ${p.why}`), '')
  }
  for (const p of probes) {
    lines.push(multi ? `## Kane runs: ${p.probe}` : '## Kane runs', ...runLines('Owner plants the canary', p.ownerRun), ...runLines('Stranger looks for it', p.strangerRun), '')
    if (p.replay?.length) {
      lines.push(
        multi ? `### Data reads sent again: ${p.probe}` : '## Data reads sent again',
        'Right after Kane\'s run, Stranger sent the stranger\'s data requests again (GET only) to see what the server hands out.',
        '',
        ...p.replay.map((r) => `- ${r.as === 'stranger' ? 'With the stranger\'s login' : 'With no login'}: GET ${r.url.split('?')[0]} -> ${r.status ?? r.error}${r.hit ? ', **owner\'s canary in the response**' : ''}`),
        '',
      )
    }
    const found = [...(p.evidence ?? []), ...(p.anonymous ?? [])]
    if (found.length) {
      lines.push(multi ? `### Where the canary showed up: ${p.probe}` : '## Where the canary showed up', ...found.map((h) => `- ${h.url ? `${h.url.split('?')[0]}, ` : ''}${h.where}: …${h.snippet}…`), '')
    }
  }
  return lines.join('\n')
}

// The table a leaking probe points at: the response that carried the canary, else the only table its page read.
const tableOf = (p) => [...(p.evidence ?? []), ...(p.anonymous ?? [])].find((h) => h.url)?.url?.match(/\/rest\/v1\/([A-Za-z0-9_]+)/)?.[1] ?? (p.tables?.length === 1 ? p.tables[0] : undefined)

function fix(cfg, r) {
  const leaks = (r.probes?.length ? r.probes : [r]).filter((p) => p.verdict === 'LEAK')
  const multi = (r.probes?.length ?? 1) > 1
  const hint = HINTS[cfg.database] ?? HINTS.unknown
  const tables = [...new Set(leaks.map(tableOf))]
  const known = tables.filter(Boolean)

  const found = (p) => {
    const where = [...(p.evidence ?? []), ...(p.anonymous ?? [])].find((h) => h.url)?.url
    const table = tableOf(p)
    return [
      multi ? `### ${p.probe}` : null,
      multi ? '' : null,
      `- Canary the owner planted: \`${p.canary}\``,
      `- How it showed up: ${p.seen === 'network' ? 'in what the server sent the stranger' : p.seen === 'anonymous' ? 'in what the server sends with no login at all' : 'on the page'}`,
      p.anonymous?.length ? `- **No login needed:** the API returned it to a request with no login (only the public key), so anyone on the internet can read these rows.` : null,
      where ? `- Response that carried it: ${where.split('?')[0]}${table ? ` (table \`${table}\`)` : ''}` : null,
      !where && p.tables?.length ? `- Tables the stranger's page read: ${p.tables.map((t) => `\`${t}\``).join(', ')}` : null,
      p.strangerRun?.failedStep ? `- Kane's failing check: ${p.strangerRun.failedStep.remark}` : null,
      p.strangerRun?.testUrl ? `- Kane run: ${p.strangerRun.testUrl}` : null,
      multi ? '' : null,
    ]
  }

  return [
    '# Stranger found a data leak',
    '',
    `Signed in as **${r.stranger}**, Kane could see ${leaks.length > 1 ? 'records' : 'a record'} that only **${r.owner}** created.`,
    '',
    ...(multi ? [`${leaks.length} of ${r.probes.length} probes leaked.`, ''] : []),
    ...leaks.flatMap(found),
    `- Full report: .stranger/report.md`,
    '',
    '## What to fix',
    '',
    ...(known.length > 1 && cfg.database === 'supabase' ? known.flatMap((t) => [`### Table \`${t}\``, '', ...hint(cfg, t), '']) : [...hint(cfg, known[0]), '']),
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
