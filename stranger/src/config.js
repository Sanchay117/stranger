import { existsSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'

export const DEFAULT_CONFIG = 'stranger.config.json'

// "$NAME" or "${NAME}" pulls a value from the environment, so passwords stay out of the config file.
function fromEnv(value, field) {
  if (typeof value !== 'string') return value
  const match = value.match(/^\$\{?([A-Z0-9_]+)\}?$/)
  if (!match) return value
  const resolved = process.env[match[1]]
  if (!resolved) throw new Error(`${field} points at $${match[1]}, which is not set (add it to .env or your shell)`)
  return resolved
}

export function loadConfig(path = DEFAULT_CONFIG, overrides = {}) {
  const file = resolve(path)
  if (!existsSync(file)) throw new Error(`No ${path} here. Run "stranger init" to create one.`)
  const root = dirname(file)
  const envFile = resolve(root, '.env')
  if (existsSync(envFile)) process.loadEnvFile(envFile)

  const raw = JSON.parse(readFileSync(file, 'utf8'))
  const cfg = { ...raw, ...overrides }
  for (const who of ['owner', 'stranger']) {
    if (!cfg[who]?.email || !cfg[who]?.password) throw new Error(`${path} needs ${who}.email and ${who}.password`)
    cfg[who] = { email: fromEnv(cfg[who].email, `${who}.email`), password: fromEnv(cfg[who].password, `${who}.password`) }
  }
  if (!cfg.url) throw new Error(`${path} needs a url`)
  cfg.url = fromEnv(cfg.url, 'url')
  cfg.plant ??= 'create a new record in the app (for example an invoice, note, post or message) and type the text into its main free-text field'
  cfg.look ??= 'the main list of records in the app'
  cfg.probes = probesOf(cfg, path)
  cfg.personas = personasOf(cfg, path)
  // API checks need PostgREST, so they default to on only for Supabase apps.
  cfg.tamper ??= cfg.database === 'supabase'
  cfg.numeric ??= cfg.database === 'supabase'
  cfg.blast ??= true
  // Newer API checks, also Supabase only: a stranger forging a row in the owner's name, the owner's files
  // in storage, live updates (realtime), and database functions the pages called.
  cfg.forge ??= cfg.database === 'supabase'
  cfg.storage ??= cfg.database === 'supabase'
  cfg.realtime ??= cfg.database === 'supabase'
  cfg.rpc ??= cfg.database === 'supabase'
  // Open the owner's own record pages directly as the stranger (when the owner's run visited any).
  cfg.links ??= true
  cfg.realtimeTopics = Array.isArray(cfg.realtimeTopics) ? cfg.realtimeTopics.map(String) : []
  cfg.storageBuckets = Array.isArray(cfg.storageBuckets) ? cfg.storageBuckets.map(String) : []
  // Optional: a Postgres URL (read only use) so the fix brief can list the live policies too.
  cfg.databaseUrl = optionalEnv(cfg.databaseUrl)
  // Leak guards: the reads that leaked, sent again by "stranger guard" against this Supabase project (its
  // public URL and anon key, as the app itself ships them), and Kane test files for the page checks.
  cfg.guards ??= cfg.database === 'supabase'
  cfg.supabaseUrl = optionalEnv(cfg.supabaseUrl ?? '$SUPABASE_URL') ?? optionalEnv('$VITE_SUPABASE_URL')
  cfg.supabaseAnonKey = optionalEnv(cfg.supabaseAnonKey ?? '$SUPABASE_ANON_KEY') ?? optionalEnv('$VITE_SUPABASE_ANON_KEY')
  cfg.database ??= 'unknown'
  cfg.migrations ??= null
  cfg.timeout ??= 420
  cfg.root = root
  return cfg
}

// One probe per kind of private record. Without "probes", the top-level plant and look are the only probe.
// Each probe costs two Kane runs (owner, then stranger), so list only the records that matter.
function probesOf(cfg, path) {
  if (cfg.probes == null) return [{ name: 'main', plant: cfg.plant, look: cfg.look }]
  if (!Array.isArray(cfg.probes) || !cfg.probes.length) throw new Error(`${path}: "probes" must be a non-empty list`)
  const names = new Set()
  return cfg.probes.map((p, i) => {
    const name = String(p?.name ?? `probe ${i + 1}`)
    if (names.has(name)) throw new Error(`${path}: two probes are called "${name}"`)
    names.add(name)
    if (typeof p?.plant !== 'string' || typeof p?.look !== 'string') throw new Error(`${path}: probe "${name}" needs "plant" and "look"`)
    return { name, plant: p.plant, look: p.look }
  })
}

// Extra accounts for the API checks: "see" (a teammate who should see the owner's records)
// or "hide" (a removed member, or anyone else who should not).
function personasOf(cfg, path) {
  if (cfg.personas == null) return []
  if (!Array.isArray(cfg.personas)) throw new Error(`${path}: "personas" must be a list`)
  return cfg.personas.map((p, i) => {
    const name = String(p?.name ?? `persona ${i + 1}`)
    if (!p?.email || !p?.password) throw new Error(`${path}: persona "${name}" needs email and password`)
    if (p.expect !== 'see' && p.expect !== 'hide') throw new Error(`${path}: persona "${name}" needs "expect": "see" or "hide"`)
    return { name, expect: p.expect, email: fromEnv(p.email, `${name}.email`), password: fromEnv(p.password, `${name}.password`) }
  })
}

// Like fromEnv, but a missing variable just turns the feature off.
function optionalEnv(value) {
  if (typeof value !== 'string') return null
  const match = value.match(/^\$\{?([A-Z0-9_]+)\}?$/)
  return match ? process.env[match[1]] || null : value
}

export const TEMPLATE = {
  url: 'https://your-app.example.com',
  owner: { email: '$OWNER_EMAIL', password: '$OWNER_PASSWORD' },
  stranger: { email: '$STRANGER_EMAIL', password: '$STRANGER_PASSWORD' },
  plant: 'create a new invoice and type the text into the Note field',
  look: 'the list of invoices on the main page',
  database: 'supabase',
  migrations: 'supabase/migrations',
}
