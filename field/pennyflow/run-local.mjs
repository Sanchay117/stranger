// Run from the local PennyFlow checkout. Raw evidence stays in its ignored .stranger folder.
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from '../../node_modules/pg/lib/index.js'

const root = process.cwd()
process.loadEnvFile(join(root, '.env'))
const db = new URL(process.env.SUPABASE_DB_URL)
const api = new URL(process.env.VITE_SUPABASE_URL)
const local = (url, port) => ['localhost', '127.0.0.1'].includes(url.hostname) && url.port === port
if (!local(db, '54322') || !local(api, '54321')) throw new Error('Only the throwaway local Supabase is allowed')
if (!existsSync(join(root, 'src/components/TransactionModal.tsx'))) throw new Error('Run this from PennyFlow')

const [action = 'preflight', stage = 'as-shipped'] = process.argv.slice(2)
if (!['preflight', 'run'].includes(action)) throw new Error('Use preflight or run <as-shipped|rls-off|fixed>')
if (!['as-shipped', 'rls-off', 'fixed'].includes(stage)) throw new Error('Unknown field-test stage')
const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, connectionTimeoutMillis: 5000 })
try {
  await client.connect()
  const { rows: tables } = await client.query(`
    select c.relname as name, c.relrowsecurity as rls
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and c.relname in ('categories', 'transactions') order by c.relname
  `)
  if (tables.length !== 2) throw new Error('Apply PennyFlow original schema to the throwaway DB first')
  const { rows: accounts } = await client.query('select id from auth.users where email = any($1)', [
    [process.env.OWNER_EMAIL, process.env.STRANGER_EMAIL],
  ])
  if (accounts.length !== 2) throw new Error('Both test accounts must exist')
  for (const who of ['OWNER', 'STRANGER']) {
    const response = await fetch(new URL('/auth/v1/token?grant_type=password', api), {
      method: 'POST',
      headers: { apikey: process.env.VITE_SUPABASE_PUBLISHABLE_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ email: process.env[`${who}_EMAIL`], password: process.env[`${who}_PASSWORD`] }),
    })
    if (!response.ok) throw new Error(`${who} test account cannot sign in`)
    await response.body.cancel()
  }
  const response = await fetch('http://127.0.0.1:5301/')
  if (!response.ok || !(await response.text()).includes('src/main.tsx')) throw new Error('PennyFlow Vite server is not ready on 5301')
  if (stage !== 'rls-off' && tables.some(t => !t.rls)) throw new Error('Expected RLS enabled before this stage')
  if (stage === 'rls-off' && tables.find(t => t.name === 'transactions').rls) throw new Error('Expected transactions RLS disabled for this stage')
  console.log(JSON.stringify({ localOnly: true, tables, testAccounts: accounts.length, signIns: 'both passed', app: 'ready' }))
} finally {
  await client.end()
}

if (action === 'run') {
  const cli = fileURLToPath(new URL('../../stranger/bin/stranger.js', import.meta.url))
  const last = join(root, '.stranger/last.json')
  const previous = existsSync(last) ? JSON.parse(readFileSync(last, 'utf8')).id : null
  const startedAt = Date.now()
  const run = spawnSync(process.execPath, [cli, 'run', '--timeout', '300'], { cwd: root, stdio: 'inherit' })
  if (!existsSync(last)) throw new Error('No result written. Check Kane login and its run_end output')
  const result = JSON.parse(readFileSync(last, 'utf8'))
  if (result.id === previous || Date.parse(result.startedAt) < startedAt - 1000) throw new Error('No fresh result written')
  const dest = join(root, '.stranger/field', stage)
  mkdirSync(dest, { recursive: true })
  for (const name of ['last.json', 'report.md', 'FIX.md']) {
    const source = join(root, '.stranger', name)
    if (existsSync(source)) copyFileSync(source, join(dest, name))
  }
  const parts = result.probes?.length ? result.probes : [result]
  const credits = parts.reduce((n, p) => n + (p.ownerRun?.credits ?? 0) + (p.strangerRun?.credits ?? 0), 0)
  writeFileSync(join(dest, 'stage.json'), JSON.stringify({ stage, id: result.id, verdict: result.verdict, credits, wallSeconds: (Date.now() - startedAt) / 1000 }, null, 2) + '\n')
  console.log(JSON.stringify({ stage, id: result.id, verdict: result.verdict, credits }))
  process.exitCode = run.status ?? 3
}
