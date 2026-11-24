import { appendFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { homedir } from 'node:os'
import { functionsIn, readPolicies, viewsIn } from './policies.js'

// Reports get committed, so local paths show as ~/... instead of naming the user's home folder.
const tidy = (text) => text.split(homedir()).join('~')

// The brief's first lines for a Supabase app, by how the owner's rows reached the stranger.
const OPENERS = {
  rest: () => ['This app reads its data straight from Supabase, so the database decides who sees which rows (Row Level Security).'],
  direct: (t) => [
    `This app loads its data through its own server code, but it signs in with Supabase from the browser, so every visitor has the project's address and public key. With them anyone can read \`${t}\` straight from Supabase, and Stranger did: the stranger got the owner's row. So the database decides who sees which rows (Row Level Security), whatever the server code filters.`,
  ],
  server: () => [
    "This app loads its data through its own server code: the response that carried the owner's row came from the app's own endpoint, not from Supabase. If that code queries Supabase with the signed-in user's login, the database decides who sees which rows (Row Level Security). If it uses the service role key, Row Level Security is skipped, and the code itself must filter by the signed-in user.",
  ],
}

const HINTS = {
  // "live" is the table's row level security and policies as they are in the database right now (with a
  // database URL); "via" is how the leak reached the stranger (see leakPath).
  // "opener: false" leaves out the first lines, and "rlsOff" the migrations' own row level security
  // notes, when the brief already said row level security is off (see driftHint).
  supabase: (cfg, table, { live, via = 'rest', opener = true, rlsOff = false } = {}) => {
    const known = table ?? '<table>'
    const found = table && cfg.migrations ? readPolicies(join(cfg.root, cfg.migrations), table) : null
    const col = found?.ownerColumn ?? 'user_id'
    const open = found?.select.filter((p) => p.open) ?? []
    const reads = (p) => p.command === 'select' || p.command === 'all'
    const liveOpen = (live?.policies ?? []).filter((p) => p.open && reads(p))
    const lines = opener ? [...OPENERS[via](known), ''] : []

    if (found?.files && found.rls === false && !rlsOff) {
      lines.push(`Your migrations turn Row Level Security **off** for \`${table}\`, so every account can read every row. Turn it on (\`alter table public.${table} enable row level security;\`) and add owner-only policies.`, '')
    } else if (found?.files && found.rls === null && !rlsOff) {
      lines.push(`Your migrations in \`${cfg.migrations}/\` never turn on Row Level Security for \`${table}\`. Unless it was turned on in the dashboard, every account can read every row.`, '')
    }
    if (found?.select.length) {
      lines.push(`Read (SELECT) policies on \`${table}\`, as your migrations in \`${cfg.migrations}/\` leave them:`, '')
      for (const p of found.select) {
        lines.push(`- \`"${p.name}"\` (${p.file}, for ${p.command} to ${p.roles}): \`using (${p.using ?? '?'})\`${p.open ? ' **This lets every account read every row.**' : ''}`)
      }
      lines.push('')
    }
    const migrationNote = cfg.migrations
      ? `Write it as a new migration in \`${cfg.migrations}/\` (never edit an applied one), apply it, and check UPDATE and DELETE policies on the same table too.`
      : 'Apply it as a new migration, and check UPDATE and DELETE policies on the same table too.'
    if (found?.files && !open.length && found.rls !== false && !rlsOff) {
      lines.push(
        found.select.length
          ? 'None of these looks open at a glance, so check what else can return these rows: a wider condition in one of them, a view, a `security definer` function, or a policy added in the dashboard (compare with `select * from pg_policies where tablename = \'' + table + '\'`).'
          : `No read policy on \`${table}\` was found in the migrations, so it may have been added in the dashboard. List the live ones with \`select * from pg_policies where tablename = '${table}'\`.`,
        '',
      )
    }

    // The open policies to drop: from the migrations and the live database. With neither known, the name
    // Supabase's dashboard gives an open read policy is the likeliest guess.
    const drops = [...new Set([...open, ...liveOpen].map((p) => p.name))]
    if (!drops.length && !found?.files && !live) drops.push('Enable read access for all users')
    lines.push(
      drops.length ? 'Replace the open policy with one that only returns the signed-in user\'s rows:' : 'Each account should only get its own rows back, for example:',
      '',
      '```sql',
      ...drops.map((name) => `drop policy if exists "${name}" on public.${known};`),
      `create policy "Owners can read their own rows" on public.${known}`,
      '  for select to authenticated',
      `  using ((select auth.uid()) = ${col});`,
      '```',
      '',
      migrationNote,
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

const hasExposedRows = (entry) => entry.stranger?.othersRows > 0 || entry.anonymous?.othersRows > 0
const plural = (count, noun, capped = false) => `${count}${capped ? '+' : ''} ${noun}${count === 1 && !capped ? '' : 's'}`

export function blastRows(counts, withAccounts = false) {
  if (!counts) return 'unavailable'
  const { rows, othersRows, accounts, capped } = counts
  if (othersRows == null) return `${plural(rows, 'row')} returned, ownership unknown`
  if (othersRows === 0) return capped ? 'none observed in the sample' : 'none'
  const shown = plural(othersRows, 'row', capped)
  return withAccounts && accounts != null ? `${shown} from ${plural(accounts, 'other account', capped)}` : shown
}

export function writeReport(cfg, result) {
  const dir = join(cfg.root, '.stranger')
  mkdirSync(dir, { recursive: true })

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
      ...(result.blast?.length ? { blast: result.blast.map(({ table, stranger, anonymous }) => ({ table, stranger, anonymous })) } : {}),
    }) + '\n',
  )
  return renderReport(cfg, result)
}

// report.md and FIX.md from a result, with no new Kane run and no history line. "stranger report"
// uses it to rewrite both from .stranger/last.json after Stranger itself was updated.
export function renderReport(cfg, result) {
  const dir = join(cfg.root, '.stranger')
  mkdirSync(dir, { recursive: true })
  const fixPath = join(dir, 'FIX.md')
  const reportPath = join(dir, 'report.md')
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
      `Right after Kane's runs, Stranger sent every data read from both pages again (GETs, and database functions that cannot write and take no arguments): with the stranger's login, then with none.`,
      ...(a.direct ? ['', `None of the pages' data reads held the owner's canary, so Stranger read the user tables straight from Supabase as the owner, found it in \`${a.direct}\`, and read that table again as the stranger and with no login. The browser has the project's address and public key from signing in, so anyone can send these reads.`] : []),
      '',
      ...p.replay.map((r) =>
        r.skipped
          ? `- Not sent again: ${r.method} ${r.url.split('?')[0]} (${r.skipped})`
          : `- ${r.as === 'stranger' ? "With the stranger's login" : 'With no login'}: ${r.method ?? 'GET'} ${r.url.split('?')[0]} (${r.page === 'direct' ? 'straight from Supabase' : r.page === 'owner' ? "owner's page" : r.page === 'both' ? 'both pages' : "stranger's page"}) -> ${r.status ?? r.error}${r.hit ? ", **owner's canary in the response**" : ''}`,
      ),
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
  const f = a.forge
  if (f) {
    lines.push(head('Forged owner'))
    if (!f.ran) lines.push(`Not run: ${f.why}.`, '')
    else {
      lines.push(
        `Signed in as the stranger, Stranger tried to add a row to \`${f.table}\` that names the owner in \`${f.column}\` (HTTP ${f.status ?? '?'}).`,
        '',
        `- ${f.forged ? "**It was stored: the stranger put a record into the owner's account.**" : 'Refused: no such row was stored.'}`,
        ...(f.forged || !f.cleaned ? [`- Deleted again afterwards: ${f.cleaned ? 'yes' : '**no**'}`] : []),
        '',
      )
    }
  }
  if (a.storage?.length) {
    lines.push(head('Files'), "In each storage bucket the pages used, the owner uploaded a small file holding the canary. Then the stranger, and a request with no login, tried to download it and to list the owner's folder.", '')
    for (const s of a.storage) {
      if (!s.ran) lines.push(`- \`${s.bucket}\`: not run, ${s.why}`)
      else {
        lines.push(
          `- \`${s.bucket}\`: ${s.tries.map((t) => `${t.as === 'stranger' ? 'stranger' : 'no login'} ${t.kind} ${t.hit ? '**got it**' : 'blocked'} (HTTP ${t.status ?? '?'})`).join(', ')}. ${s.cleaned ? 'File deleted afterwards.' : '**The file could not be deleted.**'}`,
        )
      }
    }
    lines.push('')
  }
  const rt = a.realtime
  if (rt) {
    lines.push(head('Live updates'))
    if (!rt.ran) lines.push(`Not run: ${rt.why}.`, '')
    else {
      lines.push(
        `The stranger opened the app's realtime connection and listened for database changes on \`${rt.table}\` and on ${rt.topics.length} likely channels (${rt.topics.map((t) => `\`${t}\``).join(', ')}). Then the owner added a row.`,
        '',
        `- Joined: ${rt.joined.length ? rt.joined.map((t) => `\`${t}\``).join(', ') : 'none'}`,
        `- ${rt.heard.length ? `**Heard the owner's row:** ${rt.heard.map((h) => `${h.kind} on \`${h.topic}\``).join(', ')}` : "Heard nothing of the owner's row."}`,
        `- Row deleted afterwards: ${rt.cleaned ? 'yes' : '**no**'}`,
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
  if (a.blast?.length) {
    lines.push(
      head('Blast radius'),
      "Counts come from the existing GET replays with the stranger's login and with none. The original queries still apply. No row values are stored.",
      '',
      ...a.blast.map((entry) => {
        const columns = hasExposedRows(entry) && entry.sensitive.length ? ` Returned sensitive columns: ${entry.sensitive.map((name) => `\`${name}\``).join(', ')}.` : ''
        return `- \`${entry.table}\`: stranger reads ${blastRows(entry.stranger, true)}. With no login: ${blastRows(entry.anonymous)}.${columns}`
      }),
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
    if (p.links?.length) {
      lines.push(
        `The stranger also opened the owner's own record ${p.links.length === 1 ? 'page' : 'pages'} directly, by address from the owner's run: ${p.links.map((l) => `\`${l}\``).join(', ')}${p.seen === 'direct-link' ? ". **The owner's canary showed there.**" : '.'}`,
        '',
      )
    }
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
  [...(p.evidence ?? []), ...(p.anonymous ?? [])].map((h) => h.url?.match(/\/rest\/v1\/(?!rpc\/)([A-Za-z0-9_]+)/)?.[1]).find(Boolean) ??
  (p.findings ?? []).find((f) => f.table)?.table ??
  p.api?.row?.table ??
  (p.tables?.length === 1 ? p.tables[0] : undefined)

// The page check, the read replays, a direct link or live database changes: the table's read policy is open.
const READ_SEEN = new Set(['page', 'network', 'anonymous', 'direct-link'])
const hits = (p) => [...(p.evidence ?? []), ...(p.anonymous ?? [])]
const rpcNames = (p) => [...new Set(hits(p).map((h) => h.url?.match(/\/rest\/v1\/rpc\/([A-Za-z0-9_]+)/)?.[1]).filter(Boolean))]

// How the owner's rows reached the stranger: through the pages' own Supabase reads ('rest'), through a
// table read straight from Supabase that no page read ('direct'), or only through the app's own server
// endpoints ('server'). It picks the first lines of the brief.
function leakPath(failing) {
  const found = failing.flatMap(hits).filter((h) => h.url)
  const supabaseRead = (h) => h.page !== 'direct' && /\/rest\/v1\//.test(h.url)
  if (found.some(supabaseRead)) return 'rest'
  if (found.some((h) => h.page === 'direct')) return 'direct'
  if (found.length && !failing.some((p) => (p.replay ?? []).some(supabaseRead))) return 'server'
  return 'rest'
}

const TITLES = { LEAK: 'Stranger found a data leak', TAMPER: "Stranger found that the stranger can change the owner's data", OVERLOCKED: 'Stranger found someone locked out who should see the data' }

function fix(cfg, r) {
  const failing = (r.probes?.length ? r.probes : [r]).filter((p) => FAILING.has(p.verdict))
  const multi = (r.probes?.length ?? 1) > 1
  const hint = HINTS[cfg.database] ?? HINTS.unknown
  const kinds = new Set(failing.flatMap((p) => [p.verdict, ...(p.findings ?? []).map((f) => f.kind)]))
  const findings = failing.flatMap((p) => p.findings ?? [])
  const rpcs = [...new Set(failing.flatMap(rpcNames))]
  const viaTable = (p) => hits(p).some((h) => h.url && !/\/rest\/v1\/rpc\//.test(h.url))
  // A record page that loads by id through a security definer function: the likely culprit, even though
  // Stranger never calls a function that takes arguments itself.
  const fns = functionsIn(cfg.migrations ? join(cfg.root, cfg.migrations) : null)
  const loaders = (p) => [...new Set((p.replay ?? []).filter((r) => r.skipped).map((r) => r.url.match(/\/rest\/v1\/rpc\/([A-Za-z0-9_]+)/)?.[1]).filter((n) => n && fns.get(n)?.definer))]
  const readLeak =
    failing.some((p) => p.verdict === 'LEAK' && READ_SEEN.has(p.seen) && (viaTable(p) || !rpcNames(p).length) && !(p.seen === 'direct-link' && loaders(p).length)) ||
    failing.some(viaTable) ||
    findings.some((f) => f.seen === 'realtime' && f.heard?.includes('database changes'))
  const directLink = failing.filter((p) => p.seen === 'direct-link')
  const forged = findings.filter((f) => f.seen === 'forged')
  const files = findings.filter((f) => f.seen === 'storage')
  const broadcast = findings.filter((f) => f.seen === 'realtime' && f.heard?.includes('broadcast'))
  const changedRow = findings.some((f) => f.kind === 'TAMPER' && f.seen !== 'forged')
  const aggregate = failing.some((p) => p.findings?.some((f) => f.seen === 'aggregate'))
  const persona = failing.some((p) => p.findings?.some((f) => f.seen === 'persona'))
  const known = [...new Set(failing.map(tableOf))].filter(Boolean)
  const via = leakPath(failing)
  const impacts = (r.blast ?? []).filter((entry) => hasExposedRows(entry) && (!known.length || known.includes(entry.table)))

  const found = (p) => {
    const where = [...(p.evidence ?? []), ...(p.anonymous ?? [])].find((h) => h.url)?.url
    const table = tableOf(p)
    return [
      multi ? `### ${p.probe}` : null,
      multi ? '' : null,
      `- Canary the owner planted: \`${p.canary}\``,
      p.verdict === 'LEAK' && p.seen ? `- How it showed up: ${{ network: 'in what the server sent the stranger', anonymous: 'in what the server sends with no login at all', aggregate: "in the stranger's totals or counts, which moved when only the owner acted", persona: 'to an account that should not see it', 'direct-link': `on the owner's own record page, which the stranger opened by its address (${(p.links ?? []).join(', ')})`, storage: 'in a file the stranger could download or list', realtime: "in the app's live updates" }[p.seen] ?? 'on the page'}` : null,
      p.anonymous?.length ? `- **No login needed:** the API returned it to a request with no login (only the public key), so anyone on the internet can read these rows.` : null,
      where ? `- Response that carried it: ${where.split('?')[0]}${table ? ` (table \`${table}\`)` : ''}` : null,
      !where && table ? `- Table: \`${table}\`` : null,
      ...(p.findings ?? []).map((f) => `- ${f.kind}: ${f.text}`),
      p.strangerRun?.failedStep ? `- Kane's failing check: ${p.strangerRun.failedStep.remark}` : null,
      p.strangerRun?.testUrl ? `- Kane run: ${p.strangerRun.testUrl}` : null,
      multi ? '' : null,
    ]
  }

  const views = viewsIn(cfg.migrations ? join(cfg.root, cfg.migrations) : null)
  const perTable = (t) => {
    const lines = []
    const live = t ? r.live?.[t] : undefined
    const forgedHere = forged.some((f) => !t || f.table === t)
    const drift = cfg.database === 'supabase' && (readLeak || changedRow || forgedHere) && !views.has(t) ? driftOf(cfg, t, live, failing) : null
    if (drift) {
      // One cause behind the reads, changes and forged rows: say it once, with its fix, instead of
      // suggesting policies the table already has.
      lines.push(...OPENERS[via](t), '', ...driftHint(cfg, t, drift, { live, anon: failing.some((p) => p.anonymous?.length), changed: changedRow, forged: forgedHere }), '')
      const policies = readPolicies(cfg.migrations ? join(cfg.root, cfg.migrations) : null, t)
      const liveOpen = (live?.policies ?? []).some((p) => p.open)
      if (drift === 'off' && (liveOpen || policies.select.some((p) => p.open) || !(policies.select.length || live?.policies?.length))) {
        lines.push('The read policies need fixing too:', '', ...hint(cfg, t, { live, via, opener: false, rlsOff: true }), '')
      }
    } else {
      // A view has no policies of its own: its fix is security_invoker (in "extra" below).
      if ((readLeak || persona) && !views.has(t)) lines.push(...hint(cfg, t, { live, via }), '')
      if (changedRow) lines.push(...writeHint(cfg, t), '')
      if (forgedHere) lines.push(...insertHint(cfg, t ?? forged[0].table, forged[0].column), '')
    }
    if (aggregate) {
      lines.push(
        "Something the stranger reads adds up or counts rows without checking who is asking: usually a view or a database function. In Postgres a view runs with its creator's rights unless it is made with `with (security_invoker = true)`, and a `security definer` function skips row level security too. Make them respect the caller, or filter by `auth.uid()` inside.",
        '',
      )
    }
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
  const dir = cfg.migrations ? join(cfg.root, cfg.migrations) : null
  const extra = [
    ...(directLink.length ? linkHint(directLink, [...new Set(directLink.flatMap(loaders))], fns) : []),
    ...(rpcs.length ? rpcHint(dir, rpcs) : []),
    // Views that leak rows (a read of them carried the canary) or totals (a read of them moved).
    ...[...new Set([...known, ...failing.flatMap((p) => (p.api?.numeric?.changed ?? []).map((c) => c.url.match(/\/rest\/v1\/([A-Za-z0-9_]+)/)?.[1]))])]
      .filter((t) => views.get(t)?.invoker === false)
      .flatMap((t) => viewHint(views.get(t), t)),
    ...(files.length ? storageHint(dir, [...new Set(files.map((f) => f.bucket))]) : []),
    ...(broadcast.length ? broadcastHint(broadcast[0].table ?? known[0]) : []),
  ]

  return [
    `# ${TITLES[r.verdict] ?? 'Stranger found a problem'}`,
    '',
    ...(impacts.length ? [`Impact: ${impacts.map(({ table, stranger, anonymous }) => `\`${table}\`: stranger reads ${blastRows(stranger, true)} (${blastRows(anonymous)} with no login)`).join('. ')}.`, ''] : []),
    `Owner: **${r.owner}**. Stranger: **${r.stranger}**.`,
    '',
    ...(multi ? [`${failing.length} of ${r.probes.length} probes failed.`, ''] : []),
    ...failing.flatMap(found),
    `- Full report: .stranger/report.md`,
    '',
    '## What to fix',
    '',
    ...(known.length > 1 && cfg.database === 'supabase' ? known.flatMap((t) => [`### Table \`${t}\``, '', ...perTable(t)]) : perTable(known[0])),
    ...extra,
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

// The database is not running the table's policies as the migrations write them. 'off': row level
// security is off in the live database. 'suspected' (no live look): the migrations turn it on with only
// owner-only policies, yet a read of the table itself (not a view or a function) gave the owner's rows away.
function driftOf(cfg, t, live, failing) {
  if (!t) return null
  if (live?.rls === false) return 'off'
  if (live) return null
  const found = readPolicies(cfg.migrations ? join(cfg.root, cfg.migrations) : null, t)
  const ownerOnly = found.rls === true && found.select.length > 0 && found.all.every((p) => !p.open && !p.checkOpen)
  const tableRead = failing.flatMap(hits).some((h) => h.url && new RegExp(`/rest/v1/${t}(?:[?/]|$)`).test(h.url))
  return ownerOnly && tableRead ? 'suspected' : null
}

function driftHint(cfg, t, kind, { live, anon, changed, forged }) {
  const found = readPolicies(cfg.migrations ? join(cfg.root, cfg.migrations) : null, t)
  const did = [changed && 'change rows they do not own', forged && "add rows in the owner's name"].filter(Boolean)
  const also = did.length ? `, and the stranger could ${did.join(' and ')}` : ''
  const enable = ['```sql', `alter table public.${t} enable row level security;`, '```', '']
  const migration = cfg.migrations ? `Write it as a new migration in \`${cfg.migrations}/\` (never edit an applied one) so every copy of the database gets it, and apply it.` : 'Write it as a new migration so every copy of the database gets it, and apply it.'
  if (kind === 'off') {
    const ownerOnly = !(live?.policies ?? []).some((p) => p.open) && !found.all.some((p) => p.open) && (found.select.length || live?.policies?.length)
    return [
      `Row Level Security is **off** for \`${t}\` in the live database right now, so its policies do nothing: every account can read every row${anon ? ', and so can anyone with the public key and no login' : ''}${also}.${found.rls === true ? ' Your migrations turn it on, so it was turned off by hand, in the dashboard or the SQL editor.' : found.rls === false ? ' Your migrations turn it off.' : ' Your migrations never turn it on.'} Turn it back on:`,
      '',
      ...enable,
      `${ownerOnly ? `Once it is on, the policies already on \`${t}\` limit each account to its own rows, so no new policy is needed. ` : ''}${migration} This one change fixes everything above together. Then run Stranger again: the policies themselves only count once Row Level Security is on.`,
    ]
  }
  return [
    `Your migrations turn Row Level Security on for \`${t}\`, and its policies only let each account at its own rows. Yet a read of the table itself gave the owner's row to the stranger${anon ? ' and to a request with no login' : ''}${also}. So the live database is not running what the migrations say. Most likely Row Level Security was turned off for the table by hand (in the dashboard or the SQL editor), or a policy was added there. Check both:`,
    '',
    '```sql',
    `select relrowsecurity from pg_class where oid = 'public.${t}'::regclass; -- false: it is off`,
    `select policyname, cmd, roles, qual from pg_policies where schemaname = 'public' and tablename = '${t}';`,
    '```',
    '',
    'If it is off, turn it back on, and the policies in your migrations do the rest:',
    '',
    ...enable,
    `If a policy you do not recognise shows up, drop it. ${migration}${cfg.databaseUrl ? '' : ' With a `databaseUrl` in stranger.config.json, Stranger reads the live state itself and says which one it is.'}`,
  ]
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

function insertHint(cfg, t, column) {
  const found = t && cfg.migrations ? readPolicies(join(cfg.root, cfg.migrations), t) : null
  const col = column ?? found?.ownerColumn ?? 'user_id'
  const inserts = found?.all.filter((p) => p.command === 'insert' || p.command === 'all') ?? []
  return [
    `The stranger could add a row to \`${t}\` with the owner's id in \`${col}\`. The insert policy never checks that new rows belong to the person adding them, so anyone can put records into anyone's account.`,
    ...(inserts.length ? ['', 'Your migrations leave these insert policies:', '', ...inserts.map((p) => `- \`"${p.name}"\` (${p.file}, for ${p.command}): \`with check (${p.check ?? ''})\`${p.checkOpen || p.check == null ? ' **checks nothing about the owner**' : ''}`)] : []),
    '',
    'New rows should only be allowed in the signed-in user\'s own name:',
    '',
    '```sql',
    ...inserts.filter((p) => p.checkOpen || p.check == null).map((p) => `drop policy if exists "${p.name}" on public.${t};`),
    `create policy "Users can add their own rows" on public.${t}`,
    '  for insert to authenticated',
    `  with check ((select auth.uid()) = ${col});`,
    '```',
  ]
}

function linkHint(probes, suspects, fns) {
  const pages = probes.flatMap((p) => p.links ?? []).join(', ')
  const lines = [`The list page hid the owner's record, but its own page (${pages}) showed it to the stranger. Whatever loads one record by its id does not check who is asking.`]
  if (!suspects.length) return [...lines.map((l) => `${l} Fix that check on the server, in the policy or function the record page reads, not by hiding the link.`), '']
  return [
    ...lines,
    '',
    `The pages called ${suspects.map((n) => `\`${n}()\` (${fns.get(n).file})`).join(', ')}: a \`security definer\` function that takes the record's id. It reads the table with its creator's rights, so row level security never applies, and it is the likely loader of that page. (Stranger never calls a function that takes arguments itself, so this is where to look, not a second proof.) The table's own read policy may be fine.`,
    '',
    'Make it run with the caller\'s rights, or check the owner inside it, in a new migration:',
    '',
    '```sql',
    ...suspects.map((n) => `alter function public.${n} security invoker;`),
    '-- or keep it security definer and add  and user_id = (select auth.uid())  to its where clause',
    '```',
    '',
  ]
}

function rpcHint(dir, names) {
  const fns = functionsIn(dir)
  return [
    `The owner's canary came back from ${names.map((n) => `\`${n}()\``).join(', ')}, a database function the app calls. ${names.some((n) => fns.get(n)?.definer) ? 'It is `security definer`, so it runs with its creator\'s rights and row level security never applies to what it reads.' : 'It returns rows from every account.'}`,
    '',
    ...names.filter((n) => fns.get(n)).map((n) => `- \`${n}()\` is in ${fns.get(n).file}${fns.get(n).definer ? ' (security definer)' : ''}`),
    '',
    'Make it run with the caller\'s rights, or filter by the caller inside it, in a new migration:',
    '',
    '```sql',
    ...names.map((n) => `alter function public.${n}() security invoker;`),
    '-- or, if it must stay security definer, add  where user_id = (select auth.uid())  to its query',
    '```',
    '',
  ]
}

function viewHint(view, t) {
  return [
    `\`${t}\` is a view (${view.file}) made without \`security_invoker\`, so it reads its tables with its creator's rights and row level security never applies.`,
    '',
    '```sql',
    `alter view public.${t} set (security_invoker = true);`,
    '```',
    '',
  ]
}

function storageHint(dir, buckets) {
  const open = readPolicies(dir, 'objects').all.filter((p) => p.open && ['select', 'all'].includes(p.command))
  return [
    `Files in ${buckets.map((b) => `\`${b}\``).join(', ')} are readable by accounts that don't own them. Supabase Storage keeps files in \`storage.objects\`, and its policies decide who can read each file. A public bucket skips them for downloads altogether.`,
    ...(open.length ? ['', 'Your migrations leave these open read policies on storage.objects:', '', ...open.map((p) => `- \`"${p.name}"\` (${p.file}): \`using (${p.using})\``)] : []),
    '',
    "Keep the bucket private and upload each file under the owner's id (`<user id>/file.txt`), then only let owners read their own folder:",
    '',
    '```sql',
    ...buckets.map((b) => `update storage.buckets set public = false where id = '${b}';`),
    ...open.map((p) => `drop policy if exists "${p.name}" on storage.objects;`),
    'create policy "Owners can read their own files" on storage.objects',
    '  for select to authenticated',
    `  using (bucket_id in (${buckets.map((b) => `'${b}'`).join(', ')}) and (storage.foldername(name))[1] = (select auth.uid())::text);`,
    '```',
    '',
  ]
}

function broadcastHint(t) {
  return [
    "The stranger joined a live-updates channel named after the owner and heard the owner's new row. Broadcast channels are public unless they are marked private, and their names are easy to guess, so anyone who knows the name hears everything sent on it.",
    '',
    'Send on a private channel and add a policy on `realtime.messages` that only lets each user join their own topic:',
    '',
    '```sql',
    `-- where the row is sent, the last argument makes the message private`,
    `perform realtime.send(payload, 'new_row', '${t ?? '<table>'}:' || new.user_id::text, true);`,
    '',
    'create policy "Users hear only their own topic" on realtime.messages',
    '  for select to authenticated',
    `  using ((select realtime.topic()) = '${t ?? '<table>'}:' || (select auth.uid())::text);`,
    '```',
    '',
    'In the client, join with `supabase.channel(topic, { config: { private: true } })`.',
    '',
  ]
}
