// Applies supabase/migrations/*.sql in name order, each once, each in a transaction.
// Usage: node --env-file=.env scripts/db-apply.mjs [--only 0001_invoices.sql]
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import pg from 'pg'

const dir = new URL('../supabase/migrations/', import.meta.url).pathname
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null

if (!process.env.SUPABASE_DB_URL) {
  console.error('SUPABASE_DB_URL is missing from .env')
  process.exit(2)
}

const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } })
await client.connect()

try {
  await client.query(`
    create schema if not exists ops;
    create table if not exists ops.migrations (name text primary key, applied_at timestamptz not null default now());
  `)
  const { rows } = await client.query('select name from ops.migrations')
  const done = new Set(rows.map((r) => r.name))
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()

  for (const file of files) {
    if (only && file !== only) continue
    if (done.has(file)) {
      console.log(`skip   ${file}`)
      continue
    }
    const sql = await readFile(join(dir, file), 'utf8')
    await client.query('begin')
    try {
      await client.query(sql)
      await client.query('insert into ops.migrations (name) values ($1)', [file])
      await client.query('commit')
      console.log(`apply  ${file}`)
    } catch (err) {
      await client.query('rollback')
      console.error(`failed ${file}: ${err.message}`)
      process.exitCode = 1
      break
    }
  }
} finally {
  await client.end()
}
