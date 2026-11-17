// Puts the live Duebook back in its leaky state, the way supabase/migrations on this branch describe it.
// Use after a fix loop on another branch has applied its fix migration to the shared demo database.
//
// It drops every policy on public.invoices, re-creates the policies from 0001_invoices.sql
// (including the leaky "Enable read access for all users"), and forgets any applied migration
// that is not in this checkout, so merging the fix later applies it again.
// It also deletes the rows Stranger's Kane runs planted ("Stranger check" with a canary or control
// note), so a judge who opens Duebook as the stranger sees Maya's invoices first, not test rows.
// Kane's run pages and .stranger/history.jsonl keep the record of every run.
//
// Usage: node --env-file=.env scripts/demo-reset.mjs [--dry-run]   (--dry-run shows it all, changes nothing)
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
const dryRun = process.argv.includes('--dry-run')

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
  const planted = await client.query(
    `delete from public.invoices i
      using auth.users u
      where u.id = i.user_id
        and i.client_name = 'Stranger check'
        and i.note ~ '^stranger-(canary|control)-[0-9a-z]+$'
      returning u.email, i.note`,
  )
  const byOwner = {}
  for (const r of planted.rows) byOwner[r.email] = (byOwner[r.email] ?? 0) + 1
  for (const [email, n] of Object.entries(byOwner)) console.log(`removed  ${n} Stranger test rows from ${email}`)
  if (!planted.rows.length) console.log('removed  no Stranger test rows (none left)')
  if (dryRun) {
    await client.query('rollback')
    console.log('Dry run: nothing changed.')
  } else {
    await client.query('commit')
    console.log('Duebook is leaky again, on purpose, and free of test rows.')
  }
} catch (err) {
  await client.query('rollback')
  console.error(`reset failed, nothing changed: ${err.message}`)
  process.exitCode = 1
} finally {
  await client.end()
}
