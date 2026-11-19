import { useEffect, useMemo, useState } from 'react'
import { supabase, configured } from '../src/supabase'
import { Halftone } from '../src/Art.jsx'
import { caseById } from './cases.js'
import Scorecard from './Scorecard.jsx'

const money = (cents) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format((cents ?? 0) / 100)

const params = () => new URLSearchParams(window.location.search)
const caseUrl = (id, note) => `/bench/?case=${id}${note ? `&note=${note}` : ''}`

export default function Bench() {
  const c = caseById(params().get('case'))
  if (!c) return <Scorecard />
  return <CasePage c={c} />
}

function Banner({ c }) {
  return (
    <div className="banner">
      <p role="note">
        Stranger bench, case <strong>{c.id}</strong>: {c.title.toLowerCase()}. The bug is left in on purpose. Please don't enter real details.{' '}
        <a href="/bench/">All cases and the scorecard</a>
      </p>
    </div>
  )
}

function CasePage({ c }) {
  const [session, setSession] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!configured) return setReady(true)
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => data.subscription.unsubscribe()
  }, [])

  if (!ready) return null
  return (
    <>
      <Banner c={c} />
      {!configured ? (
        <main className="auth">
          <p className="muted">Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the repo's .env.</p>
        </main>
      ) : session ? (
        <Notes c={c} session={session} />
      ) : (
        <Auth c={c} />
      )}
    </>
  )
}

const DEMO = {
  owner: { email: import.meta.env.OWNER_EMAIL, password: import.meta.env.OWNER_PASSWORD, label: 'Open as Maya, the owner' },
  stranger: { email: import.meta.env.STRANGER_EMAIL, password: import.meta.env.STRANGER_PASSWORD, label: 'Open as a stranger' },
}

function Auth({ c }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function logIn(creds) {
    setBusy(true)
    setMessage('')
    const { error } = await supabase.auth.signInWithPassword(creds)
    setBusy(false)
    if (error) setMessage(error.message)
  }

  // ?as=owner or ?as=stranger logs straight in, like Duebook. The case stays in the address.
  useEffect(() => {
    const p = params()
    const as = p.get('as')
    if (!DEMO[as]?.email) return
    p.delete('as')
    window.history.replaceState(null, '', `${window.location.pathname}?${p}`)
    logIn({ email: DEMO[as].email, password: DEMO[as].password })
  }, [])

  return (
    <main className="auth">
      <h1 className="logo">Notes</h1>
      <p className="tagline">{c.bug}</p>
      <div className="demo">
        {Object.entries(DEMO).map(([key, d]) =>
          d.email ? (
            <button key={key} className={key === 'stranger' ? 'primary' : 'secondary'} disabled={busy} onClick={() => logIn({ email: d.email, password: d.password })}>
              {d.label}
            </button>
          ) : null,
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          logIn({ email, password })
        }}
        className="card"
        aria-label="Log in with email"
      >
        <p className="muted small">Or log in with email</p>
        <label>
          Email
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Password
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button className="primary" disabled={busy}>
          {busy ? 'One moment' : 'Log in'}
        </button>
      </form>
      {message && <p className="message">{message}</p>}
    </main>
  )
}

const emptyForm = { title: '', amount: '', body: '' }

function Notes({ c, session }) {
  const me = session.user.id
  const noteId = useMemo(() => params().get('note'), [])
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(undefined)
  const [total, setTotal] = useState(null)
  const [files, setFiles] = useState(null)
  const [live, setLive] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    let res
    if (c.read === 'rpc') {
      // "My notes" from a database function; the page keeps only its own.
      res = await supabase.rpc(c.rpc)
      if (res.data) res.data = res.data.filter((n) => n.user_id === me)
    } else if (c.read === 'view') {
      res = await supabase.from(c.view).select('*').eq('user_id', me).order('created_at', { ascending: false })
    } else if (c.read === 'mine') {
      res = await supabase.from(c.table).select('*').eq('user_id', me).order('created_at', { ascending: false })
    } else {
      // Row level security decides what comes back.
      res = await supabase.from(c.table).select('*').order('created_at', { ascending: false })
    }
    if (res.error) setError(res.error.message)
    else setNotes(res.data)
    if (c.total) {
      const t = await supabase.from(c.total).select('*')
      setTotal(t.data?.[0] ?? null)
    }
    if (c.bucket) {
      const f = await supabase.storage.from(c.bucket).list(me, { limit: 100, sortBy: { column: 'created_at', order: 'desc' } })
      setFiles(f.data ?? [])
    }
    setLoading(false)
  }

  async function loadOpen() {
    if (!noteId) return
    const res = c.detail === 'rpc' ? await supabase.rpc(c.get, { note_id: noteId }) : await supabase.from(c.table).select('*').eq('id', noteId)
    setOpen(res.data?.[0] ?? null)
  }

  useEffect(() => {
    load()
    loadOpen()
  }, [])

  // Live updates: this case listens on its own public channel, named after the signed-in user.
  useEffect(() => {
    if (!c.live) return
    const channel = supabase
      .channel(`${c.table}:${me}`)
      .on('broadcast', { event: 'new_note' }, ({ payload }) => setLive((l) => [`Saved just now: ${payload.title}`, ...l].slice(0, 3)))
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  async function create(e) {
    e.preventDefault()
    setError('')
    const { data, error } = await supabase
      .from(c.table)
      .insert({ title: form.title.trim(), body: form.body.trim() || null, amount_cents: Math.round(parseFloat(form.amount || '0') * 100) })
      .select()
    if (error) return setError(error.message)
    const note = data[0]
    if (c.bucket) {
      // A copy of the note as a file, in the owner's own folder.
      const up = await supabase.storage.from(c.bucket).upload(`${me}/${note.id}.txt`, new Blob([`${note.title}\n${note.body ?? ''}\n`], { type: 'text/plain' }), { upsert: true })
      if (up.error) setError(up.error.message)
    }
    if (c.open) return window.location.assign(caseUrl(c.id, note.id))
    setForm(emptyForm)
    setShowForm(false)
    load()
  }

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })
  const sum = notes.reduce((s, n) => s + n.amount_cents, 0)

  return (
    <div className="app">
      <header className="top">
        <span className="logo small">Notes</span>
        <span className="who">
          <span className="muted">{session.user.email}</span>
          <button className="link" onClick={() => supabase.auth.signOut()}>
            Log out
          </button>
        </span>
      </header>

      <main>
        {noteId && (
          <section className="card open-note" aria-label="Open note">
            {open === undefined ? (
              <p className="muted">Loading the note</p>
            ) : open === null ? (
              <p className="muted">Note not found.</p>
            ) : (
              <>
                <div className="row">
                  <strong>{open.title}</strong>
                  <span className="amount">{money(open.amount_cents)}</span>
                </div>
                {open.body && <p className="note">{open.body}</p>}
              </>
            )}
            <a className="link" href={caseUrl(c.id)}>
              Back to your notes
            </a>
          </section>
        )}

        <section className="summary halftone">
          <Halftone seed={5} />
          <div>
            <p className="muted">{c.total ? 'Total of your notes' : 'Your notes'}</p>
            <p className="big">{c.total ? money(total?.total_cents) : notes.length}</p>
          </div>
          <button className="primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancel' : 'New note'}
          </button>
        </section>

        {showForm && (
          <form className="card grid" onSubmit={create} aria-label="New note">
            <label>
              Title
              <input required value={form.title} onChange={set('title')} />
            </label>
            <label>
              Amount (USD)
              <input required inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,2})?" value={form.amount} onChange={set('amount')} />
            </label>
            <label className="wide">
              Note
              <textarea rows={2} value={form.body} onChange={set('body')} />
            </label>
            <button className="primary wide">Save note</button>
          </form>
        )}

        {error && <p className="message">{error}</p>}
        {live.map((line, i) => (
          <p key={i} className="muted small live">
            {line}
          </p>
        ))}

        <h2>Your notes</h2>
        {loading ? (
          <p className="muted">Loading</p>
        ) : notes.length === 0 ? (
          <p className="muted empty">No notes yet. Add your first one above.</p>
        ) : (
          <ul className="list">
            {notes.map((n) => (
              <li key={n.id} className="card invoice">
                <div className="row">
                  <strong>{n.title}</strong>
                  <span className="amount">{money(n.amount_cents)}</span>
                </div>
                {n.body && <p className="note">{n.body}</p>}
                {c.detail && (
                  <a className="link small" href={caseUrl(c.id, n.id)}>
                    Open
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}

        {files && (
          <>
            <h2>Your files</h2>
            {files.length === 0 ? <p className="muted small">No files yet.</p> : <ul className="files">{files.map((f) => <li key={f.name}>{f.name}</li>)}</ul>}
          </>
        )}
        {!c.total && notes.length > 0 && <p className="muted small">Total: {money(sum)}</p>}
      </main>
    </div>
  )
}
