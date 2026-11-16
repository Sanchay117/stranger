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
  cfg.database ??= 'unknown'
  cfg.migrations ??= null
  cfg.timeout ??= 420
  cfg.root = root
  return cfg
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
