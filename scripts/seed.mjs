// Creates the two demo accounts and Maya's sample invoices. Safe to run twice.
// Usage: node --env-file=.env scripts/seed.mjs
import { createClient } from '@supabase/supabase-js'

const need = ['VITE_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'OWNER_EMAIL', 'OWNER_PASSWORD', 'STRANGER_EMAIL', 'STRANGER_PASSWORD']
const missing = need.filter((k) => !process.env[k])
if (missing.length) {
  console.error(`Missing from .env: ${missing.join(', ')}`)
  process.exit(2)
}

const admin = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function ensureUser(email, password) {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (!error) return data.user
  const { data: list, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (listError) throw listError
  const user = list.users.find((u) => u.email === email)
  if (!user) throw error
  await admin.auth.admin.updateUserById(user.id, { password })
  return user
}

const owner = await ensureUser(process.env.OWNER_EMAIL, process.env.OWNER_PASSWORD)
const stranger = await ensureUser(process.env.STRANGER_EMAIL, process.env.STRANGER_PASSWORD)

// Sample data, clearly fake (.example domains).
const sample = [
  { client_name: 'Northwind Studio', client_email: 'billing@northwind.example', amount_cents: 240000, due_date: '2026-11-30', note: 'Brand refresh, phase 2. Bank transfer to Maya Patel, HDFC account ending 4417.' },
  { client_name: 'Lumen Health', client_email: 'ap@lumenhealth.example', amount_cents: 115000, due_date: '2026-11-21', note: 'Landing page redesign, 3 rounds of revisions.' },
  { client_name: 'Okafor & Sons Bakery', client_email: 'tunde@okafor.example', amount_cents: 38000, due_date: '2026-11-10', status: 'overdue', note: 'Menu board and flyers. Second reminder sent.' },
  { client_name: 'Kestrel Outdoor', client_email: 'finance@kestrel.example', amount_cents: 320000, due_date: '2026-10-31', status: 'paid', note: 'App icon set and store screenshots.' },
]

const { count } = await admin.from('invoices').select('id', { count: 'exact', head: true }).eq('user_id', owner.id)
if (count > 0) {
  console.log(`owner already has ${count} invoices, leaving them`)
} else {
  // A bulk insert sends one column set for every row, so give each row every column.
  const { error } = await admin.from('invoices').insert(sample.map((row) => ({ status: 'unpaid', ...row, user_id: owner.id })))
  if (error) throw error
  console.log(`inserted ${sample.length} invoices for ${owner.email}`)
}

console.log(`owner    ${owner.email}  ${owner.id}`)
console.log(`stranger ${stranger.email}  ${stranger.id}`)
