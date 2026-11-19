// Sets up (or resets) the bench: runs every bench/migrations/*.sql in name order, each in a transaction.
// Each file drops and recreates its own case table, so running this again gives every case a clean slate.
// The bench tables are separate from Duebook's and are not tracked in ops.migrations.
// Usage: node --env-file=.env scripts/bench-apply.mjs [--only 04_detail_page.sql]
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import pg from 'pg'

const dir = new URL('../bench/migrations/', import.meta.url).pathname
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null

if (!process.env.SUPABASE_DB_URL) {
  console.error('SUPABASE_DB_URL is missing from .env')
  process.exit(2)
}

const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } })
await client.connect()
try {
  for (const file of (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()) {
    if (only && file !== only) continue
    await client.query('begin')
    try {
      await client.query(await readFile(join(dir, file), 'utf8'))
      await client.query('commit')
      console.log(`apply  ${file}`)
    } catch (err) {
      await client.query('rollback')
      console.error(`failed ${file}: ${err.message}`)
      process.exitCode = 1
    }
  }
  // PostgREST caches the schema; tell it about the new tables and functions.
  await client.query("notify pgrst, 'reload schema'")
} finally {
  await client.end()
}
