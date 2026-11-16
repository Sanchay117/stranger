import { randomBytes } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { runKane, passed, said } from './kane.js'
import { searchEvidence } from './evidence.js'

// The canary and control are random and not secret, so they go into the objective as literal
// text: Kane's step remarks then quote them, while variables would only show as {{placeholders}}.
export const OWNER_OBJECTIVE = (cfg, canary) =>
  `Go to ${cfg.url}. If you are already logged in, log out first. ` +
  `Log in with the email {{email}} and the password {{password}} using the email form. ` +
  `Then ${cfg.plant}. The text to type is exactly: ${canary} . Save it. ` +
  `Verify that the text "${canary}" is visible on the page.`

export const STRANGER_OBJECTIVE = (cfg, canary, control) =>
  `Go to ${cfg.url}. If you are already logged in, log out first. ` +
  `Log in with the email {{email}} and the password {{password}} using the email form. ` +
  `Then ${cfg.plant}. The text to type is exactly: ${control} . Save it. ` +
  `Open ${cfg.look}. Verify that the text "${control}" is visible on the page. ` +
  `Finally, verify that the text "${canary}" does not appear anywhere on the page.`

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

// One Stranger check: the owner plants a fresh canary, then a second account looks for it.
export async function check(cfg, { headless = true, onProgress = () => {} } = {}) {
  const id = randomBytes(3).toString('hex')
  const canary = `stranger-canary-${id}`
  const control = `stranger-control-${id}`
  const startedAt = new Date().toISOString()
  const runDir = join(cfg.root, '.stranger', 'runs', `${startedAt.replace(/[:.]/g, '-')}-${id}`)
  mkdirSync(runDir, { recursive: true })

  const base = { id, canary, control, url: cfg.url, startedAt, runDir, owner: cfg.owner.email, stranger: cfg.stranger.email }
  // Kane saves each run as a test file in its working folder, secrets included, so it runs
  // inside this (gitignored) run folder, never the repo root.
  const common = { url: cfg.url, timeout: cfg.timeout, headless, cwd: runDir }

  onProgress({ phase: 'owner', canary })
  const ownerResult = await runKane({
    ...common,
    name: `stranger-owner-${id}`,
    objective: OWNER_OBJECTIVE(cfg, canary),
    vars: {
      email: { value: cfg.owner.email },
      password: { value: cfg.owner.password, secret: true },
    },
    logFile: join(runDir, 'owner.ndjson'),
    onEvent: (event) => onProgress({ phase: 'owner', event }),
  })
  const owner = summarize(ownerResult)
  onProgress({ phase: 'owner-done', run: owner })

  if (!passed(ownerResult)) {
    const why =
      ownerResult.exitCode === 2 || ownerResult.spawnError
        ? `Kane did not start: ${owner.reason ?? 'see the log'}`
        : `Kane could not plant the canary as the owner: ${owner.reason ?? owner.oneLiner ?? 'see the log'}`
    return { ...base, verdict: 'INCONCLUSIVE', why, ownerRun: owner, strangerRun: null, evidence: [] }
  }

  onProgress({ phase: 'stranger', canary })
  const strangerResult = await runKane({
    ...common,
    name: `stranger-probe-${id}`,
    objective: STRANGER_OBJECTIVE(cfg, canary, control),
    vars: {
      email: { value: cfg.stranger.email },
      password: { value: cfg.stranger.password, secret: true },
    },
    logFile: join(runDir, 'stranger.ndjson'),
    onEvent: (event) => onProgress({ phase: 'stranger', event }),
  })
  const stranger = summarize(strangerResult)
  const evidence = searchEvidence(stranger.sessionDir, canary).hits
  onProgress({ phase: 'stranger-done', run: stranger, evidence })

  const result = { ...base, ownerRun: owner, strangerRun: stranger, evidence }

  if (passed(strangerResult)) {
    if (evidence.length) {
      return { ...result, verdict: 'LEAK', seen: 'network', why: `The page hid it, but the browser received the owner's canary${evidence[0].url ? ` from ${evidence[0].url}` : ''}.` }
    }
    return { ...result, verdict: 'CLEAN', why: 'The stranger saw their own data and none of the owner\'s.' }
  }

  const failedText = [stranger.failedStep?.remark, stranger.reason, stranger.oneLiner].filter(Boolean).join(' ')
  const all = said(strangerResult)
  const aboutCanary = failedText.includes(canary) || (!failedText.includes(control) && /canary/i.test(failedText))
  const aboutControl = failedText.includes(control)

  if (aboutCanary || (evidence.length && !aboutControl)) {
    return {
      ...result,
      verdict: 'LEAK',
      seen: aboutCanary ? 'page' : 'network',
      why: aboutCanary
        ? `Signed in as ${cfg.stranger.email}, Kane found the owner's canary on the page.`
        : `The browser received the owner's canary${evidence[0].url ? ` from ${evidence[0].url}` : ''}.`,
    }
  }
  if (all.includes(canary) && !aboutControl && stranger.exitCode === 1 && !stranger.failedStep) {
    return { ...result, verdict: 'LEAK', seen: 'page', why: `Kane reported the owner's canary while signed in as ${cfg.stranger.email}.` }
  }
  return {
    ...result,
    verdict: 'INCONCLUSIVE',
    why: aboutControl
      ? 'The stranger could not see their own test record, so the page check means nothing yet. Check "look" in stranger.config.json.'
      : `Kane stopped before the canary check: ${stranger.reason ?? stranger.oneLiner ?? 'see the log'}`,
  }
}
