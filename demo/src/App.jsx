import { useEffect, useState } from 'react'
import { supabase, configured } from './supabase'

const money = (cents, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100)

const day = (iso) =>
  iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No due date'

function Banner() {
  return (
    <div className="banner" role="note">
      Demo app with a security bug left in on purpose, so Stranger has something to catch. Please don't enter real details.
    </div>
  )
}

export default function App() {
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
      <Banner />
      {!configured ? <NotConfigured /> : session ? <Invoices session={session} /> : <Auth />}
    </>
  )
}

function NotConfigured() {
  return (
    <main className="auth">
      <h1 className="logo">Duebook</h1>
      <p className="muted">Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the repo's .env to connect a database.</p>
    </main>
  )
}

// Two public demo accounts, so nobody has to sign up. ?as=owner or ?as=stranger logs straight in.
const DEMO = {
  owner: { email: import.meta.env.OWNER_EMAIL, password: import.meta.env.OWNER_PASSWORD, label: 'Open as Maya, the owner' },
  stranger: { email: import.meta.env.STRANGER_EMAIL, password: import.meta.env.STRANGER_PASSWORD, label: 'Open as a stranger' },
}

function Auth() {
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

  useEffect(() => {
    const as = new URLSearchParams(window.location.search).get('as')
    if (DEMO[as]?.email) {
      window.history.replaceState(null, '', window.location.pathname)
      logIn({ email: DEMO[as].email, password: DEMO[as].password })
    }
  }, [])

  return (
    <main className="auth">
      <h1 className="logo">Duebook</h1>
      <p className="tagline">Send invoices. Get paid on time.</p>

      <div className="demo">
        {Object.entries(DEMO).map(([key, d]) =>
          d.email ? (
            <button key={key} className={key === 'stranger' ? 'primary' : 'secondary'} disabled={busy} onClick={() => logIn({ email: d.email, password: d.password })}>
              {d.label}
            </button>
          ) : null,
        )}
        <p className="muted small">Maya has a few invoices. The stranger has none of their own, so anything they see belongs to someone else.</p>
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

const emptyForm = { client_name: '', client_email: '', amount: '', due_date: '', note: '' }

function Invoices({ session }) {
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(emptyForm)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    // Row Level Security scopes this query to the signed-in user's invoices.
    const { data, error } = await supabase.from('invoices').select('*').order('created_at', { ascending: false })
    if (error) setError(error.message)
    else setInvoices(data)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function create(e) {
    e.preventDefault()
    setError('')
    const { error } = await supabase.from('invoices').insert({
      client_name: form.client_name.trim(),
      client_email: form.client_email.trim() || null,
      amount_cents: Math.round(parseFloat(form.amount || '0') * 100),
      due_date: form.due_date || null,
      note: form.note.trim() || null,
    })
    if (error) return setError(error.message)
    setForm(emptyForm)
    setShowForm(false)
    load()
  }

  async function markPaid(id) {
    const { error } = await supabase.from('invoices').update({ status: 'paid' }).eq('id', id)
    if (error) return setError(error.message)
    load()
  }

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })
  const outstanding = invoices.filter((i) => i.status !== 'paid').reduce((sum, i) => sum + i.amount_cents, 0)

  return (
    <div className="app">
      <header className="top">
        <span className="logo small">Duebook</span>
        <span className="who">
          <span className="muted">{session.user.email}</span>
          <button className="link" onClick={() => supabase.auth.signOut()}>
            Log out
          </button>
        </span>
      </header>

      <main>
        <section className="summary">
          <div>
            <p className="muted">Outstanding</p>
            <p className="big">{money(outstanding)}</p>
          </div>
          <button className="primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancel' : 'New invoice'}
          </button>
        </section>

        {showForm && (
          <form className="card grid" onSubmit={create} aria-label="New invoice">
            <label>
              Client name
              <input required value={form.client_name} onChange={set('client_name')} />
            </label>
            <label>
              Client email
              <input type="email" value={form.client_email} onChange={set('client_email')} />
            </label>
            <label>
              Amount (USD)
              <input required inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,2})?" value={form.amount} onChange={set('amount')} />
            </label>
            <label>
              Due date
              <input type="date" value={form.due_date} onChange={set('due_date')} />
            </label>
            <label className="wide">
              Note
              <textarea rows={2} value={form.note} onChange={set('note')} />
            </label>
            <button className="primary wide">Save invoice</button>
          </form>
        )}

        {error && <p className="message">{error}</p>}

        <h2>Your invoices</h2>
        {loading ? (
          <p className="muted">Loading</p>
        ) : invoices.length === 0 ? (
          <p className="muted empty">No invoices yet. Create your first one above.</p>
        ) : (
          <ul className="list">
            {invoices.map((inv) => (
              <li key={inv.id} className="card invoice">
                <div className="row">
                  <strong>{inv.client_name}</strong>
                  <span className="amount">{money(inv.amount_cents, inv.currency)}</span>
                </div>
                <div className="row muted">
                  <span>{inv.client_email || 'No email'}</span>
                  <span>Due {day(inv.due_date)}</span>
                </div>
                {inv.note && <p className="note">{inv.note}</p>}
                <div className="row">
                  <span className={`pill ${inv.status}`}>{inv.status}</span>
                  {inv.status !== 'paid' && (
                    <button className="link" onClick={() => markPaid(inv.id)}>
                      Mark paid
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
