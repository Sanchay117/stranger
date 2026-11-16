// Supabase's direct database host is IPv6-only. This finds the IPv4 session pooler host
// for the project in SUPABASE_DB_URL and prints the pooler URL shape (password hidden).
// Usage: node --env-file=.env scripts/find-pooler.mjs [region ...]
import pg from 'pg'

const direct = new URL(process.env.SUPABASE_DB_URL)
const ref = direct.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/)?.[1]
if (!ref) {
  console.log('SUPABASE_DB_URL is not a direct db.<ref>.supabase.co URL; nothing to do')
  process.exit(0)
}

const regions = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['ap-south-1', 'ap-southeast-1', 'ap-northeast-1', 'ap-northeast-2', 'ap-southeast-2', 'us-east-1', 'us-east-2', 'us-west-1', 'eu-central-1', 'eu-west-1', 'eu-west-2']

for (const region of regions) {
  for (const prefix of ['aws-0', 'aws-1']) {
    const host = `${prefix}-${region}.pooler.supabase.com`
    const client = new pg.Client({
      host,
      port: 5432,
      user: `postgres.${ref}`,
      password: decodeURIComponent(direct.password),
      database: 'postgres',
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 6000,
    })
    try {
      await client.connect()
      await client.query('select 1')
      await client.end()
      console.log(`FOUND ${host}`)
      console.log(`SUPABASE_DB_URL=postgresql://postgres.${ref}:<password>@${host}:5432/postgres`)
      process.exit(0)
    } catch (err) {
      console.log(`no    ${host}: ${err.message.slice(0, 60)}`)
      try {
        await client.end()
      } catch {}
    }
  }
}
process.exit(1)
