// Makes the preview database match this branch: Duebook's policies as 0001_invoices.sql leaves them,
// then every later migration in supabase/migrations applied in order. Used by the fix loop in CI, so
// each pull request is checked against its own migrations, never against the live demo database.
// It also deletes the rows earlier Stranger runs planted.
//
// It only ever reads PREVIEW_DB_URL (never SUPABASE_DB_URL), so it cannot touch the live database by mistake.
// Usage: PREVIEW_DB_URL=postgres://... node scripts/preview-sync.mjs
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import pg from 'pg'

const url = process.env.PREVIEW_DB_URL
if (!url) {
  console.error('PREVIEW_DB_URL is not set. This script only runs against the preview database.')
  process.exit(2)
}
if (process.env.SUPABASE_DB_URL_LIVE && process.env.SUPABASE_DB_URL_LIVE === url) {
  console.error('PREVIEW_DB_URL is the live database. Refusing.')
  process.exit(2)
}

const dir = new URL('../supabase/migrations/', import.meta.url).pathname
const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()
const [first, ...rest] = files
const base = await readFile(join(dir, first), 'utf8')

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await client.connect()
try {
  await client.query('begin')
  await client.query('create schema if not exists ops; create table if not exists ops.migrations (name text primary key, applied_at timestamptz not null default now())')
  // The first migration creates the table "if not exists"; running it again only re-creates the policies.
  const { rows } = await client.query("select policyname from pg_policies where schemaname = 'public' and tablename = 'invoices'")
  for (const { policyname } of rows) await client.query(`drop policy ${client.escapeIdentifier(policyname)} on public.invoices`)
  await client.query(base)
  await client.query('delete from ops.migrations')
  await client.query('insert into ops.migrations (name) values ($1)', [first])
  console.log(`reset  ${first} (${rows.length} policies dropped, then re-created from it)`)
  for (const file of rest) {
    await client.query(await readFile(join(dir, file), 'utf8'))
    await client.query('insert into ops.migrations (name) values ($1)', [file])
    console.log(`apply  ${file}`)
  }
  const planted = await client.query("delete from public.invoices where client_name = 'Stranger check' and note ~ '^stranger-(canary|control)-[0-9a-z-]+$'")
  console.log(`removed ${planted.rowCount} rows from earlier Stranger runs`)
  await client.query('commit')
} catch (err) {
  await client.query('rollback')
  console.error(`preview sync failed, nothing changed: ${err.message}`)
  process.exitCode = 1
} finally {
  await client.end()
}
