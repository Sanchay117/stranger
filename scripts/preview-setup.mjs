// One-time setup of the preview database the CI fix loop uses: Duebook's migrations and the two demo
// accounts with Maya's sample invoices, in a second Supabase project (never the live one).
// Put the preview project's values in .env as PREVIEW_DB_URL, PREVIEW_SUPABASE_URL and
// PREVIEW_SERVICE_ROLE_KEY, then: npm run preview:setup
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const need = ['PREVIEW_DB_URL', 'PREVIEW_SUPABASE_URL', 'PREVIEW_SERVICE_ROLE_KEY', 'OWNER_EMAIL', 'OWNER_PASSWORD', 'STRANGER_EMAIL', 'STRANGER_PASSWORD']
const missing = need.filter((k) => !process.env[k])
if (missing.length) {
  console.error(`Missing from .env: ${missing.join(', ')}`)
  process.exit(2)
}
if (process.env.PREVIEW_DB_URL === process.env.SUPABASE_DB_URL || process.env.PREVIEW_SUPABASE_URL === process.env.VITE_SUPABASE_URL) {
  console.error('The preview values point at the live project. Use a second Supabase project.')
  process.exit(2)
}

const script = (name) => fileURLToPath(new URL(name, import.meta.url))
const steps = [
  ['Migrations', script('db-apply.mjs'), { SUPABASE_DB_URL: process.env.PREVIEW_DB_URL }],
  ['Demo accounts and invoices', script('seed.mjs'), { VITE_SUPABASE_URL: process.env.PREVIEW_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: process.env.PREVIEW_SERVICE_ROLE_KEY }],
]
for (const [label, file, env] of steps) {
  console.log(`\n${label}`)
  const r = spawnSync(process.execPath, [file], { stdio: 'inherit', env: { ...process.env, ...env } })
  if (r.status !== 0) process.exit(r.status ?? 1)
}
console.log('\nPreview database ready. Add PREVIEW_DB_URL, PREVIEW_SUPABASE_URL and PREVIEW_SUPABASE_ANON_KEY as repository secrets.')
