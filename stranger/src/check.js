import { randomBytes } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { runKane, passed, said } from './kane.js'
import { searchEvidence, restTables, apiRequests, loginHeaders, rpcCalls, storageBuckets, visitedUrls } from './evidence.js'
import { replayReads, replayRpc, blastRadius, mergeBlastRadius, supabaseTarget, findCanaryRow, numericCheck, tamperCheck, personaCheck, forgeCheck, storageCheck, realtimeCheck } from './api.js'
import { userTables, livePolicies, readPolicies, functionsIn } from './policies.js'

// The canary and control are random and not secret, so they go into the objective as literal
// text: Kane's step remarks then quote them, while variables would only show as {{placeholders}}.
// Every Kane run starts in a fresh browser, so there is nothing to log out of first.
// "where" is { url, plant, look }: the app and one probe.
export const OWNER_OBJECTIVE = (where, canary) =>
  `Go to ${where.url}. ` +
  `Log in with the email {{email}} and the password {{password}} using the email form. ` +
  `Then ${where.plant}. The text to type is exactly: ${canary} . Save it. ` +
  `Verify that the text "${canary}" is visible on the page.`

// "links" are addresses of the owner's own record pages (from the owner's run). The stranger opens each
// one directly: an app can hide a record from the list and still show it to anyone who has its link.
export const STRANGER_OBJECTIVE = (where, canary, control, links = []) =>
  `Go to ${where.url}. ` +
  `Log in with the email {{email}} and the password {{password}} using the email form. ` +
  `Then ${where.plant}. The text to type is exactly: ${control} . Save it. ` +
  `Open ${where.look}. Verify that the text "${control}" is visible on the page. ` +
  `${links.length ? 'Then' : 'Finally,'} verify that the text "${canary}" does not appear anywhere on the page.` +
  links.map((link) => ` Then go directly to ${link} and verify that the text "${canary}" is not shown on that page either.`).join('')

// The owner's record pages worth opening as the stranger: same site, not the start page, and an
// address that names one record (a long number, a uuid or a long hex id).
export function recordLinks(urls, start) {
  let base
  try {
    base = new URL(start)
  } catch {
    return []
  }
  const key = (u) => `${u.origin}${u.pathname.replace(/\/$/, '')}?${[...u.searchParams].filter(([k]) => !k.startsWith('x-vercel')).map(([k, v]) => `${k}=${v}`).join('&')}`
  const out = []
  for (const raw of urls) {
    let u
    try {
      u = new URL(raw)
    } catch {
      continue
    }
    u.hash = ''
    if (u.origin !== base.origin || key(u) === key(base)) continue
    const where = decodeURIComponent(u.pathname + u.search)
    if (!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-|\/\d{2,}(?:\/|$)|[=/][0-9a-f]{16,}\b|=\d{2,}\b/i.test(where)) continue
    for (const k of [...u.searchParams.keys()]) if (k.startsWith('x-vercel')) u.searchParams.delete(k)
    if (!out.includes(u.href)) out.push(u.href)
  }
  return out.slice(0, 2)
}

export function summarize(result) {
  const failed = result.steps.findLast((s) => s.status === 'failed') ?? null
  return {
    exitCode: result.exitCode,
    status: result.end?.status ?? (result.exitCode === 0 ? 'passed' : 'failed'),
    seconds: result.seconds,
    oneLiner: result.end?.one_liner ?? null,
    reason: result.end?.reason ?? result.spawnError ?? null,
    testUrl: result.end?.test_url ?? null,
    sessionDir: result.end?.session_dir ?? null,
    credits: result.end?.credits_consumed ?? null,
    resultCode: result.end?.result_code ?? null,
    failedStep: failed ? { step: failed.step, remark: failed.remark ?? null } : null,
    stderrTail: result.exitCode === 0 ? null : result.stderrTail,
  }
}

// LEAK: someone saw data they shouldn't. TAMPER: the stranger could change or delete the owner's row.
// OVERLOCKED: someone who should see the owner's data (a teammate persona) can't.
export const RANK = { LEAK: 0, TAMPER: 1, OVERLOCKED: 2, INCONCLUSIVE: 3, CLEAN: 4 }

// One Stranger check: for each probe, the owner plants a fresh canary, then a second account looks for it.
// The top-level fields describe the worst probe (LEAK, then INCONCLUSIVE, then CLEAN); "probes" has them all.
export async function check(cfg, { headless = true, onProgress = () => {} } = {}) {
  const id = randomBytes(3).toString('hex')
  const startedAt = new Date().toISOString()
  const runDir = join(cfg.root, '.stranger', 'runs', `${startedAt.replace(/[:.]/g, '-')}-${id}`)
  mkdirSync(runDir, { recursive: true })

  const probes = cfg.probes ?? [{ name: 'main', plant: cfg.plant, look: cfg.look }]
  const multi = probes.length > 1
  const results = []
  for (const [i, probe] of probes.entries()) {
    const tag = multi ? `${id}-${i + 1}` : id
    if (results.some((r) => r.notStarted)) {
      results.push(skipped(probe, tag, 'Not run: Kane did not start for an earlier probe.'))
      continue
    }
    const progress = (p) => onProgress({ ...p, probe: probe.name, index: i, total: probes.length })
    results.push(await checkProbe(cfg, probe, { tag, runDir, prefix: multi ? `${i + 1}-` : '', headless, onProgress: progress }))
  }

  const head = [...results].sort((a, b) => RANK[a.verdict] - RANK[b.verdict])[0]
  const leaks = results.filter((r) => r.verdict === 'LEAK')
  const why =
    !multi
      ? head.why
      : head.verdict === 'CLEAN'
        ? `All ${results.length} probes: the stranger saw their own data and none of the owner's.`
        : head.verdict === 'LEAK'
          ? `${leaks.length} of ${results.length} probes leaked (${leaks.map((r) => r.probe).join(', ')}). ${head.probe}: ${head.why}`
          : `${head.probe}: ${head.why}`

  // Which tables hold user data (from the migrations) and which of them any page read during the check.
  const read = [...new Set(results.flatMap((r) => r.tables ?? []))]
  const all = cfg.database === 'supabase' && cfg.migrations ? userTables(join(cfg.root, cfg.migrations)) : []
  const coverage = all.length ? { tables: all, probed: all.filter((t) => read.includes(t)), missing: all.filter((t) => !read.includes(t)) } : null

  // With a database URL, the fix brief can also show the policies as they are live, not just as migrated.
  const broken = [...new Set(results.filter((r) => r.verdict !== 'CLEAN' && r.verdict !== 'INCONCLUSIVE').flatMap((r) => r.tables ?? []))]
  const live = cfg.databaseUrl && broken.length ? await livePolicies(cfg, broken) : null
  const blast = results.flatMap((r) => r.api?.blast ?? [])

  const { notStarted, ...headFields } = head
  return {
    id,
    url: cfg.url,
    startedAt,
    runDir,
    owner: cfg.owner.email,
    stranger: cfg.stranger.email,
    ...headFields,
    why,
    ...(blast.length ? { blast: mergeBlastRadius(blast) } : {}),
    probes: results.map(({ notStarted, ...r }) => r),
    coverage,
    live,
  }
}

function skipped(probe, tag, why) {
  return { probe: probe.name, canary: `stranger-canary-${tag}`, control: `stranger-control-${tag}`, verdict: 'INCONCLUSIVE', why, ownerRun: null, strangerRun: null, evidence: [], anonymous: [], replay: [], tables: [], api: null, findings: [] }
}

async function checkProbe(cfg, probe, { tag, runDir, prefix, headless, onProgress }) {
  const canary = `stranger-canary-${tag}`
  const control = `stranger-control-${tag}`
  const where = { url: cfg.url, plant: probe.plant, look: probe.look }
  const base = { probe: probe.name, canary, control }
  // Kane saves each run as a test file in its working folder, secrets included, so it runs
  // inside this (gitignored) run folder, never the repo root.
  const common = { url: cfg.url, timeout: cfg.timeout, headless, cwd: runDir }

  onProgress({ phase: 'owner', canary })
  const ownerResult = await runKane({
    ...common,
    name: `stranger-owner-${tag}`,
    objective: OWNER_OBJECTIVE(where, canary),
    vars: {
      email: { value: cfg.owner.email },
      password: { value: cfg.owner.password, secret: true },
    },
    logFile: join(runDir, `${prefix}owner.ndjson`),
    onEvent: (event) => onProgress({ phase: 'owner', event }),
  })
  const owner = summarize(ownerResult)
  onProgress({ phase: 'owner-done', run: owner })

  if (!passed(ownerResult)) {
    const notStarted = ownerResult.exitCode === 2 || !!ownerResult.spawnError
    const why = notStarted
      ? `Kane did not start: ${owner.reason ?? 'see the log'}`
      : `Kane could not plant the canary as the owner: ${owner.reason ?? owner.oneLiner ?? 'see the log'}`
    return { ...base, verdict: 'INCONCLUSIVE', why, ownerRun: owner, strangerRun: null, evidence: [], anonymous: [], replay: [], tables: [], api: null, findings: [], notStarted }
  }

  const links = cfg.links === false ? [] : recordLinks(visitedUrls(owner.sessionDir), cfg.url)
  onProgress({ phase: 'stranger', canary, links })
  const strangerResult = await runKane({
    ...common,
    name: `stranger-probe-${tag}`,
    objective: STRANGER_OBJECTIVE(where, canary, control, links),
    vars: {
      email: { value: cfg.stranger.email },
      password: { value: cfg.stranger.password, secret: true },
    },
    logFile: join(runDir, `${prefix}stranger.ndjson`),
    onEvent: (event) => onProgress({ phase: 'stranger', event }),
  })
  const stranger = summarize(strangerResult)
  onProgress({ phase: 'stranger-ran', run: stranger })
  // Kane keeps no response bodies for API calls, so the HAR search rarely finds anything. The API checks
  // send the pages' data reads again and try writes, to see what the server really allows.
  onProgress({ phase: 'api', canary })
  const api = await apiChecks(cfg, owner, stranger, canary)
  const replay = api.replay
  const evidence = [...searchEvidence(stranger.sessionDir, canary).hits, ...replay.filter((r) => r.hit && r.as === 'stranger')]
  const anonymous = replay.filter((r) => r.hit && r.as === 'anonymous')
  const tables = [...new Set([...restTables(owner.sessionDir), ...restTables(stranger.sessionDir)])]
  onProgress({ phase: 'stranger-done', evidence, replay, api })

  const result = { ...base, ownerRun: owner, strangerRun: stranger, evidence, anonymous, replay, tables, api, links }
  return withApiFindings(cfg, result, readVerdict(cfg, probe, result, strangerResult))
}

function readVerdict(cfg, probe, { canary, control, strangerRun: stranger, evidence, anonymous, links = [] }, strangerResult) {
  const from = (hits) => (hits[0]?.url ? ` from ${hits[0].url.split('?')[0]}` : '')
  const alsoAnon = anonymous.length ? ' With no login at all, the API returns it too.' : ''
  const replayed = evidence.some((h) => h.as === 'stranger')
  const onlyOwnerPage = replayed && evidence.every((h) => h.as !== 'stranger' || h.page === 'owner')

  if (passed(strangerResult)) {
    if (evidence.length) {
      const why = onlyOwnerPage
        ? `The stranger's pages looked clean, but a read from the owner's page, sent with the stranger's login, returns the owner's canary${from(evidence)}.`
        : `The page hid it, but the server sends the owner's canary to the stranger${from(evidence)}.`
      return { verdict: 'LEAK', seen: 'network', why: why + alsoAnon }
    }
    if (anonymous.length) {
      return { verdict: 'LEAK', seen: 'anonymous', why: `The stranger's page was clean, but with no login at all the API returns the owner's canary${from(anonymous)}.` }
    }
    return { verdict: 'CLEAN', why: 'The stranger saw their own data and none of the owner\'s.' }
  }

  const failedText = [stranger.failedStep?.remark, stranger.reason, stranger.oneLiner].filter(Boolean).join(' ')
  const all = said(strangerResult)
  const aboutCanary = failedText.includes(canary) || (!failedText.includes(control) && /canary/i.test(failedText))
  const aboutControl = failedText.includes(control)
  // The failing check was on one of the owner's record pages, opened directly.
  const viaLink = links.length > 0 && (/\beither\b/i.test(failedText) || links.some((l) => failedText.includes(l)))

  // A replayed read that returns the canary is proof on its own, even when the page check went wrong.
  if (aboutCanary || replayed || (evidence.length && !aboutControl)) {
    return {
      verdict: 'LEAK',
      seen: aboutCanary ? (viaLink ? 'direct-link' : 'page') : 'network',
      why: aboutCanary
        ? `Signed in as ${cfg.stranger.email}, Kane found the owner's canary ${viaLink ? `on the owner's own record page, opened directly (${links.join(', ')}), though the list hid it` : 'on the page'}.${replayed ? ` The server sends it to the stranger${from(evidence)}.` : ''}${alsoAnon}`
        : `The server sends the owner's canary to the stranger${from(evidence)}.${alsoAnon}`,
    }
  }
  if (all.includes(canary) && !aboutControl && stranger.exitCode === 1 && !stranger.failedStep) {
    return { verdict: 'LEAK', seen: 'page', why: `Kane reported the owner's canary while signed in as ${cfg.stranger.email}.${alsoAnon}` }
  }
  if (anonymous.length) {
    return { verdict: 'LEAK', seen: 'anonymous', why: `With no login at all, the API returns the owner's canary${from(anonymous)}.` }
  }
  return {
    verdict: 'INCONCLUSIVE',
    why: aboutControl
      ? `The stranger could not see their own test record, so the page check means nothing yet. Check "look"${probe.name === 'main' ? '' : ` in the "${probe.name}" probe`} in stranger.config.json.`
      : `Kane stopped before the canary check: ${stranger.reason ?? stranger.oneLiner ?? 'see the log'}`,
  }
}

// The API checks can turn a clean or inconclusive page check into a finding of their own: they are
// direct proof from the server. Every problem is also listed in "findings" for the report.
function withApiFindings(cfg, result, verdict) {
  const { numeric, tamper, personas, forge, storage, realtime } = result.api
  const findings = []
  // Only changes the text search can't explain: if the new row's own canary text shows up, the read check covers it.
  const changed = numeric?.ran ? numeric.changed.filter((c) => !c.canary) : []
  if (changed.length) {
    findings.push({
      kind: 'LEAK',
      seen: 'aggregate',
      text: `When only the owner added a row (odd number ${numeric.odd.length ? numeric.odd.join(', ') + ' = 7331' : 'none'}), ${changed.length} of the stranger's reads changed: ${changed.map((c) => c.url.split('?')[0]).join(', ')}. The stranger's data depends on the owner's.`,
    })
  }
  for (const p of personas.filter((x) => x.ran && !x.ok)) {
    findings.push(
      p.expect === 'hide'
        ? { kind: 'LEAK', seen: 'persona', text: `${p.name} (${p.email}) should not see the owner's records, but the API gives them the canary.` }
        : { kind: 'OVERLOCKED', text: `${p.name} (${p.email}) should see the owner's records, but the API does not give them the canary.` },
    )
  }
  if (tamper?.ran && (tamper.edited || tamper.deleted)) {
    const what = [tamper.edited && 'change', tamper.deleted && 'delete'].filter(Boolean).join(' and ')
    findings.push({ kind: 'TAMPER', text: `The stranger could ${what} the owner's row in \`${tamper.table}\`.${tamper.restored === false ? ' Stranger could not put it back.' : ''}` })
  }

  if (forge?.ran && forge.forged) {
    findings.push({ kind: 'TAMPER', seen: 'forged', text: `The stranger could create a row in \`${forge.table}\` that names the owner in \`${forge.column}\`, so anyone can add records to someone else's account.${forge.cleaned ? '' : ' Stranger could not delete it again.'}` })
  }
  for (const s of storage ?? []) {
    const hits = s.ran ? s.tries.filter((t) => t.hit) : []
    if (hits.length) {
      findings.push({ kind: 'LEAK', seen: 'storage', text: `The owner's file in the \`${s.bucket}\` storage bucket: ${hits.map((h) => `${h.as === 'stranger' ? 'the stranger' : 'anyone with no login'} could ${h.kind === 'download' ? 'download it' : 'see it in a listing'}`).join(', ')}.` })
    }
  }
  if (realtime?.ran && realtime.heard.length) {
    findings.push({ kind: 'LEAK', seen: 'realtime', text: `Listening to the app's live updates, the stranger received the owner's new row the moment it was saved (${realtime.heard.map((h) => `${h.kind} on \`${h.topic}\``).join(', ')}).` })
  }

  let out = { ...result, ...verdict, findings }
  const worst = [...findings].sort((a, b) => RANK[a.kind] - RANK[b.kind])[0]
  if (worst && RANK[worst.kind] < RANK[out.verdict]) {
    const rest = findings.filter((f) => f !== worst).map((f) => ' ' + f.text).join('')
    out = { ...out, verdict: worst.kind, seen: worst.seen ?? out.seen, why: worst.text + rest + (verdict.verdict === 'INCONCLUSIVE' ? '' : ` (Page check: ${verdict.verdict}.)`) }
  } else if (findings.length) {
    out.why += ' ' + findings.filter((f) => f.text !== out.why).map((f) => f.text).join(' ')
  }
  return out
}

async function apiChecks(cfg, owner, stranger, canary) {
  const reads = new Map()
  for (const [page, run] of [['owner', owner], ['stranger', stranger]]) {
    for (const r of apiRequests(run.sessionDir)) {
      const had = reads.get(r.url)
      reads.set(r.url, had ? { ...had, page: 'both' } : { ...r, page })
    }
  }
  const list = [...reads.values()]
  const strangerLogin = loginHeaders(stranger.sessionDir)
  const ownerLogin = loginHeaders(owner.sessionDir)
  const notes = []
  const dir = cfg.migrations ? join(cfg.root, cfg.migrations) : null
  let blast
  const observe = cfg.blast === false ? undefined : (...args) => {
    if (notes.length) return
    try {
      blast ??= blastRadius(cfg, strangerLogin)
      blast.observe(...args)
    } catch {
      blast = null
      notes.push('Blast radius could not count the replay responses.')
    }
  }
  const replay = await replayReads(list, canary, strangerLogin, observe)
  const out = { reads: list.length, replay, numeric: null, tamper: null, personas: [], notes }
  if (blast) out.blast = blast.entries()

  // Database functions the pages called: only the safe ones (no arguments, cannot write) are sent again.
  if (cfg.rpc !== false) {
    const calls = new Map()
    for (const [page, run] of [['owner', owner], ['stranger', stranger]]) {
      for (const c of rpcCalls(run.sessionDir)) calls.set(c.url, calls.has(c.url) ? { ...calls.get(c.url), page: 'both' } : { ...c, page })
    }
    if (calls.size) out.replay.push(...(await replayRpc([...calls.values()], canary, strangerLogin, functionsIn(dir))))
  }

  const wantsRow = cfg.numeric || cfg.tamper || cfg.forge || cfg.realtime
  const buckets = cfg.storage ? [...new Set([...(cfg.storageBuckets ?? []), ...storageBuckets(owner.sessionDir), ...storageBuckets(stranger.sessionDir)])] : []
  if (!wantsRow && !buckets.length && !cfg.personas.length) return out
  const target = supabaseTarget(list)
  if (!target) {
    out.notes.push('Tamper, forge, numeric, storage, realtime and persona checks need a Supabase API in the logs; none was found.')
    return out
  }
  if (cfg.personas.length) out.personas = await personaCheck(target, cfg.personas, list, canary)
  if (buckets.length && ownerLogin.authorization) out.storage = await storageCheck(target, buckets, ownerLogin, strangerLogin, canary)
  if (!wantsRow) return out
  const found = ownerLogin.authorization ? await findCanaryRow(target, list, ownerLogin, canary) : null
  if (!found) {
    out.notes.push("Tamper, forge, numeric and realtime checks skipped: the owner's canary row could not be read back through the API.")
    return out
  }
  out.row = { table: found.table, field: found.field }
  if (!strangerLogin.authorization) return out
  if (cfg.numeric) out.numeric = await numericCheck(target, found, list, ownerLogin, strangerLogin, canary)
  if (cfg.tamper) out.tamper = await tamperCheck(target, found, ownerLogin, strangerLogin, canary)
  if (cfg.forge) out.forge = await forgeCheck(target, found, ownerLogin, strangerLogin, canary, readPolicies(dir, found.table).ownerColumn)
  if (cfg.realtime) out.realtime = await realtimeCheck(target, found, ownerLogin, strangerLogin, canary, cfg.realtimeTopics)
  return out
}
