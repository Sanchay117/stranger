import { CASES, LIMITS, caught } from './cases.js'
import results from './results.json'

const byId = Object.fromEntries((results.cases ?? []).map((r) => [r.id, r]))
const bugs = CASES.filter((c) => c.expect.verdict !== 'CLEAN')
const ran = CASES.filter((c) => byId[c.id])
const found = bugs.filter((c) => caught(c, byId[c.id]))
const control = CASES.find((c) => c.expect.verdict === 'CLEAN')
const quiet = control && byId[control.id] ? caught(control, byId[control.id]) : null

// Kane's share links expire after seven days. Link a saved copy if there is one
// (scripts/save-kane-runs.mjs --bench), else Kane's own link while it still opens.
const SHARE_DAYS = 7
const kaneLink = (r) => r.saved ?? (r.strangerRun && Date.now() < Date.parse(r.at) + SHARE_DAYS * 864e5 ? r.strangerRun : null)
const expired = ran.some((c) => !kaneLink(byId[c.id]))

const HOW = {
  page: 'on the page',
  network: 'via API replay',
  anonymous: 'via no-login replay',
  'direct-link': 'via direct link',
  forged: 'via forged owner',
  aggregate: 'via numeric canary',
  storage: 'via files',
  realtime: 'via live updates',
}

export default function Scorecard() {
  return (
    <>
      <div className="banner">
        <p role="note">
          Ten small notes apps on one Supabase project, each with one bug left in on purpose. <a href="/">What is Stranger?</a>
        </p>
      </div>
      <main className="app bench">
        <header className="top">
          <span className="logo small">Stranger bench</span>
          <a className="link" href="https://github.com/Sanchay117/stranger/tree/main/bench">
            Source and reports
          </a>
        </header>

        {ran.length ? (
          <section className="score">
            <p className="big">
              Stranger caught {found.length} of {bugs.length} bugs
            </p>
            <p className="muted">
              {quiet === true ? `and stayed quiet on the clean control. ` : quiet === false ? 'but raised a false alarm on the clean control. ' : ''}
              Real Kane CLI runs against {results.url}, {new Date(results.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}, {Math.round(results.credits)} Kane credits in all.
              {expired ? ' Kane keeps its share links for seven days, so for older runs the report shows what Kane did: its result, time, credits and summary.' : ''}
            </p>
          </section>
        ) : (
          <section className="score">
            <p className="big">Not run yet</p>
            <p className="muted">Run node --env-file=.env bench/run.mjs to fill this in.</p>
          </section>
        )}

        <ul className="list">
          {CASES.map((c) => {
            const r = byId[c.id]
            const ok = caught(c, r)
            return (
              <li key={c.id} className="card invoice">
                <div className="row">
                  <strong>
                    <a href={`/bench/?case=${c.id}`}>{c.id}</a>: {c.title}
                  </strong>
                  <span className={`pill ${ok === true ? 'paid' : ok === false ? 'overdue' : 'unpaid'}`}>{ok === true ? (c.expect.verdict === 'CLEAN' ? 'clean, as it should be' : 'caught') : ok === false ? 'missed' : 'not run'}</span>
                </div>
                <p className="small">{c.bug}</p>
                <p className="muted small">
                  Expected {c.expect.verdict}
                  {c.expect.seen.length ? ` (${c.check.toLowerCase()})` : ''}.
                  {r ? ` Stranger said ${r.verdict}${r.seen ? `, ${HOW[r.seen] ?? `via ${r.seen}`}` : ''}.` : ''}
                </p>
                {r && (
                  <p className="small">
                    {kaneLink(r) && (
                      <a className="link" href={kaneLink(r)}>
                        Kane run
                      </a>
                    )}{' '}
                    <a className="link" href={`https://github.com/Sanchay117/stranger/blob/main/bench/cases/${c.id}/.stranger/report.md`}>
                      Report
                    </a>
                    {r.verdict !== 'CLEAN' && (
                      <>
                        {' '}
                        <a className="link" href={`https://github.com/Sanchay117/stranger/blob/main/bench/cases/${c.id}/.stranger/FIX.md`}>
                          Fix brief
                        </a>
                      </>
                    )}
                  </p>
                )}
              </li>
            )
          })}
        </ul>

        <h2>What Stranger does not catch</h2>
        <ul className="limits">
          {LIMITS.map((l) => (
            <li key={l} className="small">
              {l}
            </li>
          ))}
        </ul>
      </main>
    </>
  )
}
