import { around } from './evidence.js'

// Checks that talk to the app's API directly, after Kane's two browser runs. They reuse the requests
// and logins Kane captured, so they cost no Kane credits and take seconds.
//
// - reads:    every data read either page made, sent with the stranger's login and with no login
// - numeric:  the owner adds a row with an odd number; any of the stranger's reads that changes leaks
//             (counts, totals and other aggregates a text search can't see)
// - tamper:   the stranger tries to edit and delete the owner's canary row; the owner checks it
// - personas: more accounts (a teammate who should see the row, a removed member who should not)
//
// numeric, tamper and personas speak PostgREST (Supabase). Writes only ever touch Stranger's own
// canary rows, and each one is undone. Tokens are used in memory and never written down.

const NEVER_SEND = new Set(['host', 'content-length', 'connection', 'accept-encoding', 'cookie', 'authorization', 'content-type', 'prefer'])
const ODD = 7331
const TIMEOUT = 15_000

const strip = (headers) => Object.fromEntries(Object.entries(headers).filter(([k]) => !NEVER_SEND.has(k)))

async function call(method, url, headers, body) {
  const out = { method, url, status: null, text: '', json: null, error: null }
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? headers : { ...headers, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT),
    })
    out.status = res.status
    out.ok = res.ok
    out.text = await res.text()
    try {
      out.json = JSON.parse(out.text)
    } catch {}
  } catch (err) {
    out.error = err.name === 'TimeoutError' ? 'timed out' : err.cause?.code ?? err.message
  }
  return out
}

// Every read (from either page) sent with the stranger's login, then with none.
export async function replayReads(reads, needle, strangerLogin) {
  const results = []
  for (const req of reads) {
    if (req.url.includes(needle)) continue
    const base = strip(req.headers)
    const tries = []
    if (Object.keys(strangerLogin).length) tries.push(['stranger', { ...base, ...strangerLogin }])
    tries.push(['anonymous', base])
    for (const [as, headers] of tries) {
      const r = await call('GET', req.url, headers)
      const out = { as, page: req.page, method: 'GET', url: req.url, status: r.status, hit: false }
      if (r.error) out.error = r.error
      if (r.ok && r.text.includes(needle)) {
        out.hit = true
        out.where = `${req.page === 'owner' ? "the owner's page read" : "the stranger's page read"}, sent again ${as === 'stranger' ? "with the stranger's login" : 'with no login'}`
        out.snippet = around(r.text, needle)
      }
      results.push(out)
    }
  }
  return results
}

// The Supabase project behind the reads: its URL and public (anon) key.
export function supabaseTarget(reads) {
  const r = reads.find((x) => x.url.includes('/rest/v1/') && x.headers.apikey)
  return r ? { base: r.url.slice(0, r.url.indexOf('/rest/v1/')), apikey: r.headers.apikey } : null
}

const rest = (target, login, extra = {}) => ({ apikey: target.apikey, 'accept-profile': 'public', 'content-profile': 'public', ...login, ...extra })

export async function signIn(target, email, password) {
  const r = await call('POST', `${target.base}/auth/v1/token?grant_type=password`, { apikey: target.apikey }, { email, password })
  return r.json?.access_token ? { authorization: `Bearer ${r.json.access_token}` } : null
}

// The owner's canary row: read the owner's tables as the owner and find the row holding the canary.
export async function findCanaryRow(target, reads, ownerLogin, canary) {
  for (const req of reads.filter((r) => r.url.includes('/rest/v1/'))) {
    const r = await call('GET', req.url, { ...strip(req.headers), ...ownerLogin })
    if (!Array.isArray(r.json)) continue
    const row = r.json.find((x) => x && JSON.stringify(x).includes(canary))
    if (!row) continue
    const field = Object.keys(row).find((k) => typeof row[k] === 'string' && row[k].includes(canary))
    const table = req.url.match(/\/rest\/v1\/([A-Za-z0-9_]+)/)[1]
    return { table, row, field, id: row.id ?? null }
  }
  return null
}

// The stranger's reads, twice before and once after the owner adds a copy of the canary row with an
// odd number in every numeric column. Reads that differ between the first two are unstable and skipped.
export async function numericCheck(target, found, reads, ownerLogin, strangerLogin, canary) {
  const readAll = () => Promise.all(reads.map((r) => call('GET', r.url, { ...strip(r.headers), ...strangerLogin })))
  const a = await readAll()
  const b = await readAll()
  const stable = reads.map((_, i) => i).filter((i) => a[i].ok && a[i].text === b[i].text)

  const copy = { ...found.row }
  for (const k of ['id', 'created_at', 'updated_at']) delete copy[k]
  copy[found.field] = `${canary}-n`
  const odd = []
  for (const [k, v] of Object.entries(copy)) {
    if (typeof v === 'number' && !/(^|_)id$/.test(k)) {
      copy[k] = ODD
      odd.push(k)
    }
  }
  const url = `${target.base}/rest/v1/${found.table}`
  const ins = await call('POST', url, rest(target, ownerLogin, { prefer: 'return=representation' }), copy)
  const added = Array.isArray(ins.json) ? ins.json[0] : null
  if (!ins.ok || !added) return { ran: false, why: `the owner could not add a second row (${ins.status ?? ins.error})`, odd, stable: stable.length }

  const c = await readAll()
  const changed = stable
    .filter((i) => c[i].text !== a[i].text)
    .map((i) => ({ url: reads[i].url, page: reads[i].page, odd: c[i].text.includes(String(ODD)) || c[i].text.includes(String(ODD / 100)), canary: c[i].text.includes(`${canary}-n`) }))

  const del = added.id != null ? await call('DELETE', `${url}?id=eq.${encodeURIComponent(added.id)}`, rest(target, ownerLogin)) : null
  return { ran: true, odd, stable: stable.length, reads: reads.length, changed, cleaned: !!del?.ok }
}

// The stranger tries to edit, then delete, the owner's canary row. The owner reads it back after each
// try, and puts it back if the stranger got through.
export async function tamperCheck(target, found, ownerLogin, strangerLogin, canary) {
  if (found.id == null) return { ran: false, why: 'the canary row has no id column' }
  const url = `${target.base}/rest/v1/${found.table}?id=eq.${encodeURIComponent(found.id)}`
  const read = async () => {
    const r = await call('GET', `${url}&select=*`, rest(target, ownerLogin))
    return Array.isArray(r.json) ? { ok: true, row: r.json[0] ?? null } : { ok: false }
  }
  const before = await read()
  if (!before.ok || !before.row) return { ran: false, why: 'the owner could not read the canary row back' }

  const edit = await call('PATCH', url, rest(target, strangerLogin, { prefer: 'return=minimal' }), { [found.field]: `${canary}-tampered` })
  const afterEdit = await read()
  const edited = afterEdit.ok && afterEdit.row != null && afterEdit.row[found.field] !== before.row[found.field]
  let restored = null
  if (edited) restored = (await call('PATCH', url, rest(target, ownerLogin), { [found.field]: before.row[found.field] })).ok

  const del = await call('DELETE', url, rest(target, strangerLogin, { prefer: 'return=minimal' }))
  const afterDelete = await read()
  const deleted = afterDelete.ok && afterDelete.row == null
  if (deleted) restored = (await call('POST', `${target.base}/rest/v1/${found.table}`, rest(target, ownerLogin), before.row)).ok

  return { ran: true, table: found.table, field: found.field, edited, deleted, editStatus: edit.status, deleteStatus: del.status, restored }
}

// Each extra account reads what the owner's and stranger's pages read, with its own login.
// "see" accounts (a teammate) must find the canary; "hide" accounts (a removed member) must not.
export async function personaCheck(target, personas, reads, canary) {
  const out = []
  for (const p of personas) {
    const login = await signIn(target, p.email, p.password)
    if (!login) {
      out.push({ name: p.name, expect: p.expect, ran: false, why: `could not sign in as ${p.email}` })
      continue
    }
    let sees = false
    for (const req of reads) {
      const r = await call('GET', req.url, { ...strip(req.headers), ...login })
      if (r.ok && r.text.includes(canary)) {
        sees = true
        break
      }
    }
    out.push({ name: p.name, email: p.email, expect: p.expect, ran: true, sees, ok: p.expect === 'see' ? sees : !sees })
  }
  return out
}

