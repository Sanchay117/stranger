// Puts the live Duebook back in its leaky state, the way supabase/migrations on this branch describe it.
// Use after a fix loop on another branch has applied its fix migration to the shared demo database.
//
// It drops every policy on public.invoices, re-creates the policies from 0001_invoices.sql
// (including the leaky "Enable read access for all users"), and forgets any applied migration
// that is not in this checkout, so merging the fix later applies it again.
//
// Usage: node --env-file=.env scripts/demo-reset.mjs
import { readdir, readFile } from 'node:fs/promises'
import pg from 'pg'

const dir = new URL('../supabase/migrations/', import.meta.url).pathname
const base = await readFile(new URL('0001_invoices.sql', `file://${dir}`), 'utf8')
const policies = base.match(/create policy[\s\S]*?;/gi) ?? []
if (!policies.some((p) => p.includes('Enable read access for all users'))) {
  console.error('0001_invoices.sql no longer has the leaky read policy; nothing to restore.')
  process.exit(2)
}
const here = new Set((await readdir(dir)).filter((f) => f.endsWith('.sql')))

const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } })
await client.connect()
try {
  await client.query('begin')
  const { rows } = await client.query(
    "select policyname from pg_policies where schemaname = 'public' and tablename = 'invoices'",
  )
  for (const { policyname } of rows) {
    await client.query(`drop policy ${client.escapeIdentifier(policyname)} on public.invoices`)
    console.log(`dropped  ${policyname}`)
  }
  for (const sql of policies) {
    await client.query(sql)
    console.log(`restored ${sql.match(/create policy\s+"([^"]+)"/i)[1]}`)
  }
  const applied = await client.query('select name from ops.migrations')
  for (const { name } of applied.rows) {
    if (here.has(name)) continue
    await client.query('delete from ops.migrations where name = $1', [name])
    console.log(`forgot   ${name} (not on this branch)`)
  }
  await client.query('commit')
  console.log('Duebook is leaky again, on purpose.')
} catch (err) {
  await client.query('rollback')
  console.error(`reset failed, nothing changed: ${err.message}`)
  process.exitCode = 1
} finally {
  await client.end()
}
