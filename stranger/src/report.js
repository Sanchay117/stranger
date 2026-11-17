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

export const FAILING = new Set(['LEAK', 'TAMPER', 'OVERLOCKED'])

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
      ...(result.findings?.length ? { findings: [...new Set(result.findings.map((f) => f.seen ? `${f.kind}:${f.seen}` : f.kind))] } : {}),
    }) + '\n',
  )
  writeFileSync(reportPath, tidy(report(cfg, result)))

  const failing = FAILING.has(result.verdict)
  if (failing) writeFileSync(fixPath, tidy(fix(cfg, result)))
  else if (result.verdict === 'CLEAN') rmSync(fixPath, { force: true })

  return {
    report: relative(process.cwd(), reportPath) || reportPath,
    fix: failing ? relative(process.cwd(), fixPath) || fixPath : null,
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

function apiLines(p, multi) {
  const a = p.api
  if (!a) return []
  const head = (t) => (multi ? `### ${t}: ${p.probe}` : `## ${t}`)
  const lines = []
  if (p.replay?.length) {
    lines.push(
      head('Data reads sent again'),
      `Right after Kane's runs, Stranger sent every data read from both pages again (GET only): with the stranger's login, then with none.`,
      '',
      ...p.replay.map((r) => `- ${r.as === 'stranger' ? "With the stranger's login" : 'With no login'}: GET ${r.url.split('?')[0]} (${r.page === 'owner' ? "owner's page" : r.page === 'both' ? 'both pages' : "stranger's page"}) -> ${r.status ?? r.error}${r.hit ? ", **owner's canary in the response**" : ''}`),
      '',
    )
  }
  const n = a.numeric
  if (n) {
    lines.push(head('Numeric canary'))
    if (!n.ran) lines.push(`Not run: ${n.why}.`, '')
    else {
      lines.push(
        `The owner added a second row with 7331 in ${n.odd.length ? n.odd.map((k) => `\`${k}\``).join(', ') : 'no numeric column'}, then Stranger read the stranger's data again (${n.stable} of ${n.reads} reads were stable enough to compare). ${n.cleaned ? 'The row was removed afterwards.' : '**The extra row could not be removed.**'}`,
        '',
        ...(n.changed.length
          ? n.changed.map((c) => `- **Changed:** GET ${c.url.split('?')[0]}${c.canary ? ' (the new row itself)' : c.odd ? ' (the odd number shows up)' : ' (a count or total moved)'}`)
          : ["- Nothing the stranger reads changed. Totals and counts don't depend on the owner's data."]),
        '',
      )
    }
  }
  const t = a.tamper
  if (t) {
    lines.push(head('Tamper check'))
    if (!t.ran) lines.push(`Not run: ${t.why}.`, '')
    else {
      lines.push(
        `The stranger tried to change, then delete, the owner's canary row in \`${t.table}\`, and the owner read it back after each try.`,
        '',
        `- Change \`${t.field}\`: ${t.edited ? '**the owner\'s row changed**' : 'blocked, the row is as the owner left it'} (HTTP ${t.editStatus ?? '?'})`,
        `- Delete: ${t.deleted ? '**the owner\'s row was deleted**' : 'blocked, the row is still there'} (HTTP ${t.deleteStatus ?? '?'})`,
        ...(t.restored != null ? [`- Put back by the owner afterwards: ${t.restored ? 'yes' : '**no**'}`] : []),
        '',
      )
    }
  }
  if (a.personas?.length) {
    lines.push(
      head('Personas'),
      ...a.personas.map((x) =>
        !x.ran
          ? `- ${x.name}: not run, ${x.why}`
          : `- ${x.name} (${x.email}), should ${x.expect === 'see' ? 'see' : 'not see'} the owner's records: ${x.sees ? 'sees the canary' : 'does not see it'}${x.ok ? '' : ' **(wrong)**'}`,
      ),
      '',
    )
  }
  if (a.notes?.length) lines.push(...a.notes.map((x) => `> ${x}`), '')
  return lines
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
  if (r.coverage) {
    const c = r.coverage
    lines.push(
      '## Coverage',
      `${c.probed.length} of ${c.tables.length} user-data tables were read during this check${c.probed.length ? ` (${c.probed.map((t) => `\`${t}\``).join(', ')})` : ''}.`,
      ...(c.missing.length ? [`Not checked: ${c.missing.map((t) => `\`${t}\``).join(', ')}. Add a probe whose \`plant\` and \`look\` reach them.`] : []),
      '',
    )
  }
  if (multi) {
    lines.push('## Probes', ...probes.map((p) => `- **${p.probe}**: ${p.verdict}, canary \`${p.canary}\`. ${p.why}`), '')
  }
  for (const p of probes) {
    lines.push(multi ? `## Kane runs: ${p.probe}` : '## Kane runs', ...runLines('Owner plants the canary', p.ownerRun), ...runLines('Stranger looks for it', p.strangerRun), '')
    lines.push(...apiLines(p, multi))
    const found = [...(p.evidence ?? []), ...(p.anonymous ?? [])]
    if (found.length) {
      lines.push(multi ? `### Where the canary showed up: ${p.probe}` : '## Where the canary showed up', ...found.map((h) => `- ${h.url ? `${h.url.split('?')[0]}, ` : ''}${h.where}: …${h.snippet}…`), '')
    }
  }
  return lines.join('\n')
}

// The table a failing probe points at: the response that carried the canary, else the API checks' row,
// else the only table its pages read.
const tableOf = (p) =>
  [...(p.evidence ?? []), ...(p.anonymous ?? [])].find((h) => h.url)?.url?.match(/\/rest\/v1\/([A-Za-z0-9_]+)/)?.[1] ??
  p.api?.row?.table ??
  (p.tables?.length === 1 ? p.tables[0] : undefined)

const TITLES = { LEAK: 'Stranger found a data leak', TAMPER: "Stranger found that the stranger can change the owner's data", OVERLOCKED: 'Stranger found someone locked out who should see the data' }

function fix(cfg, r) {
  const failing = (r.probes?.length ? r.probes : [r]).filter((p) => FAILING.has(p.verdict))
  const multi = (r.probes?.length ?? 1) > 1
  const hint = HINTS[cfg.database] ?? HINTS.unknown
  const kinds = new Set(failing.flatMap((p) => [p.verdict, ...(p.findings ?? []).map((f) => f.kind)]))
  const readLeak = failing.some((p) => p.verdict === 'LEAK' && p.seen !== 'aggregate' && p.seen !== 'persona') || failing.some((p) => (p.evidence?.length || p.anonymous?.length))
  const aggregate = failing.some((p) => p.findings?.some((f) => f.seen === 'aggregate'))
  const persona = failing.some((p) => p.findings?.some((f) => f.seen === 'persona'))
  const known = [...new Set(failing.map(tableOf))].filter(Boolean)

  const found = (p) => {
    const where = [...(p.evidence ?? []), ...(p.anonymous ?? [])].find((h) => h.url)?.url
    const table = tableOf(p)
    return [
      multi ? `### ${p.probe}` : null,
      multi ? '' : null,
      `- Canary the owner planted: \`${p.canary}\``,
      p.verdict === 'LEAK' && p.seen ? `- How it showed up: ${{ network: 'in what the server sent the stranger', anonymous: 'in what the server sends with no login at all', aggregate: "in the stranger's totals or counts, which moved when only the owner acted", persona: 'to an account that should not see it' }[p.seen] ?? 'on the page'}` : null,
      p.anonymous?.length ? `- **No login needed:** the API returned it to a request with no login (only the public key), so anyone on the internet can read these rows.` : null,
      where ? `- Response that carried it: ${where.split('?')[0]}${table ? ` (table \`${table}\`)` : ''}` : null,
      !where && table ? `- Table: \`${table}\`` : null,
      ...(p.findings ?? []).map((f) => `- ${f.kind}: ${f.text}`),
      p.strangerRun?.failedStep ? `- Kane's failing check: ${p.strangerRun.failedStep.remark}` : null,
      p.strangerRun?.testUrl ? `- Kane run: ${p.strangerRun.testUrl}` : null,
      multi ? '' : null,
    ]
  }

  const perTable = (t) => {
    const lines = []
    if (readLeak || persona) lines.push(...hint(cfg, t), '')
    if (aggregate) {
      lines.push(
        "Something the stranger reads adds up or counts rows without checking who is asking: usually a view or a database function. In Postgres a view runs with its creator's rights unless it is made with `with (security_invoker = true)`, and a `security definer` function skips row level security too. Make them respect the caller, or filter by `auth.uid()` inside.",
        '',
      )
    }
    if (kinds.has('TAMPER')) lines.push(...writeHint(cfg, t), '')
    if (kinds.has('OVERLOCKED')) {
      lines.push(
        'Someone who should see these rows, like a teammate, is now locked out. `auth.uid() = user_id` is right for private rows, but shared rows need a membership check too, for example:',
        '',
        '```sql',
        `using ((select auth.uid()) = user_id or exists (select 1 from public.members m where m.team_id = ${t ?? '<table>'}.team_id and m.user_id = (select auth.uid())))`,
        '```',
        '',
      )
    }
    const live = t && r.live?.[t]
    if (live) {
      const migrated = new Set(readPolicies(cfg.migrations ? join(cfg.root, cfg.migrations) : null, t).all.map((p) => p.name))
      lines.push(
        `Live in the database right now (row level security ${live.rls ? 'on' : live.rls === false ? '**off**' : 'unknown'}):`,
        '',
        ...live.policies.map((p) => `- \`"${p.name}"\` for ${p.command} to ${p.roles}${p.using != null ? `: \`using (${p.using})\`` : ''}${p.open && (p.command === 'select' || p.command === 'all') ? ' **open to everyone**' : ''}${cfg.migrations && !migrated.has(p.name) ? ' (not in your migrations: added by hand?)' : ''}`),
        '',
      )
    }
    return lines
  }
  const liveNote = r.live?.error ? [`(Live policies not shown: ${r.live.error}.)`, ''] : []

  return [
    `# ${TITLES[r.verdict] ?? 'Stranger found a problem'}`,
    '',
    `Owner: **${r.owner}**. Stranger: **${r.stranger}**.`,
    '',
    ...(multi ? [`${failing.length} of ${r.probes.length} probes failed.`, ''] : []),
    ...failing.flatMap(found),
    `- Full report: .stranger/report.md`,
    '',
    '## What to fix',
    '',
    ...(known.length > 1 && cfg.database === 'supabase' ? known.flatMap((t) => [`### Table \`${t}\``, '', ...perTable(t)]) : perTable(known[0])),
    ...liveNote,
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

function writeHint(cfg, t) {
  const found = t && cfg.migrations ? readPolicies(join(cfg.root, cfg.migrations), t) : null
  const col = found?.ownerColumn ?? 'user_id'
  const writes = found?.all.filter((p) => ['update', 'delete', 'all'].includes(p.command)) ?? []
  return [
    `The stranger could change or delete a row they don't own, so the UPDATE and DELETE policies on \`${t ?? '<table>'}\` don't check the owner.`,
    ...(writes.length ? ['', 'Your migrations leave these write policies:', '', ...writes.map((p) => `- \`"${p.name}"\` (${p.file}, for ${p.command}): \`using (${p.using ?? ''})\`${p.open ? ' **open**' : ''}`)] : []),
    '',
    'Each should only match the signed-in user\'s rows, for example:',
    '',
    '```sql',
    `create policy "Owners can update their own rows" on public.${t ?? '<table>'}`,
    '  for update to authenticated',
    `  using ((select auth.uid()) = ${col}) with check ((select auth.uid()) = ${col});`,
    `create policy "Owners can delete their own rows" on public.${t ?? '<table>'}`,
    '  for delete to authenticated',
    `  using ((select auth.uid()) = ${col});`,
    '```',
  ]
}
