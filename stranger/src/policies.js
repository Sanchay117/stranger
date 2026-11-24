import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

// Reads a Supabase migrations folder in order and works out which row level security policies
// each table ends up with, so the fix brief can name the real policies instead of guessing.
// It only knows what the migrations say: a policy added by hand in the dashboard is invisible here.
export function readPolicies(dir, table) {
  const out = { files: 0, rls: null, ownerColumn: null, select: [], all: [] }
  if (!dir || !table || !existsSync(dir)) return out
  const policies = new Map()
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    out.files++
    for (const sql of statements(readFileSync(join(dir, file), 'utf8'))) {
      const owner = sql.match(/^create\s+table\b[\s\S]*?\(([\s\S]*)\)\s*$/i)
      if (owner && sameTable(tableOf(sql.match(/^create\s+table\s+(?:if\s+not\s+exists\s+)?([^\s(]+)/i)?.[1]), table)) {
        out.ownerColumn ??= owner[1].match(/(?:^|,)\s*"?(\w+)"?\s+uuid\b[^,]*references\s+auth\.users\b/i)?.[1] ?? null
        continue
      }
      const rls = sql.match(/^alter\s+table\s+(?:only\s+)?([^\s]+)\s+(enable|disable)\s+row\s+level\s+security/i)
      if (rls && sameTable(tableOf(rls[1]), table)) {
        out.rls = rls[2].toLowerCase() === 'enable'
        continue
      }
      const drop = sql.match(/^drop\s+policy\s+(?:if\s+exists\s+)?("[^"]+"|\w+)\s+on\s+([^\s;]+)/i)
      if (drop && sameTable(tableOf(drop[2]), table)) {
        policies.delete(unquote(drop[1]))
        continue
      }
      const create = sql.match(/^create\s+policy\s+("[^"]+"|\w+)\s+on\s+([^\s]+)([\s\S]*)$/i)
      if (create && sameTable(tableOf(create[2]), table)) {
        const rest = create[3]
        policies.set(unquote(create[1]), {
          name: unquote(create[1]),
          file,
          command: (rest.match(/\bfor\s+(all|select|insert|update|delete)\b/i)?.[1] ?? 'all').toLowerCase(),
          roles: rest.match(/\bto\s+([\w\s,]+?)(?=\s+(?:using|with)\b|$)/i)?.[1].trim() ?? 'public',
          using: clause(rest, 'using'),
          check: clause(rest, 'with\\s+check'),
        })
      }
    }
  }
  out.all = [...policies.values()].map((p) => ({ ...p, open: isOpen(p.using), checkOpen: isOpen(p.check) }))
  out.select = out.all.filter((p) => p.command === 'select' || p.command === 'all')
  return out
}

// Tables that hold per-user data: a column that references auth.users (Supabase's accounts).
export function userTables(dir) {
  if (!dir || !existsSync(dir)) return []
  const out = new Set()
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    for (const sql of statements(readFileSync(join(dir, file), 'utf8'))) {
      const m = sql.match(/^create\s+table\s+(?:if\s+not\s+exists\s+)?([^\s(]+)\s*\(([\s\S]*)\)\s*$/i)
      if (m && /references\s+auth\.users\b/i.test(m[2])) out.add(tableOf(m[1]))
      const drop = sql.match(/^drop\s+table\s+(?:if\s+exists\s+)?([^\s;]+)/i)
      if (drop) out.delete(tableOf(drop[1]))
    }
  }
  return [...out]
}

// The policies as they are in the live database right now (read only: pg_policies and pg_class).
// Uses the "pg" package (the app's own, else Stranger's), else the psql command line; without either,
// or on any error, this says why and moves on.
export async function livePolicies(cfg, tables) {
  const pg = await loadPg(cfg)
  if (!pg) return psqlPolicies(cfg, tables)
  // A local database usually has no SSL; a hosted one (Supabase) needs it.
  const local = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(cfg.databaseUrl) || /sslmode=disable/.test(cfg.databaseUrl)
  const client = new pg.Client({ connectionString: cfg.databaseUrl, ssl: local ? false : { rejectUnauthorized: false }, connectionTimeoutMillis: 10_000 })
  try {
    await client.connect()
    const out = {}
    for (const table of tables) {
      const rls = await client.query("select c.relrowsecurity as rls_on from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = $1", [table])
      const { rows } = await client.query("select policyname, cmd, roles::text[] as roles, qual from pg_policies where schemaname = 'public' and tablename = $1 order by policyname", [table])
      out[table] = { rls: rls.rows[0]?.rls_on ?? null, policies: rows.map((r) => ({ name: r.policyname, command: r.cmd.toLowerCase(), roles: r.roles.join(', '), using: r.qual, open: isOpen(r.qual) })) }
    }
    return out
  } catch (err) {
    return { error: `could not read the live policies: ${err.message}` }
  } finally {
    await client.end().catch(() => {})
  }
}

async function loadPg(cfg) {
  for (const from of [join(cfg.root, 'package.json'), import.meta.url]) {
    try {
      const require = createRequire(from)
      return (await import(pathToFileURL(require.resolve('pg')).href)).default
    } catch {}
  }
  return null
}

// The same two queries through psql. The login goes in PG* variables, never on the command line, and the
// table name is a psql variable (:'t'), quoted by psql.
const PSQL = `select json_build_object(
  'rls', (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = :'t'),
  'policies', coalesce((select json_agg(json_build_object('name', policyname, 'command', lower(cmd), 'roles', array_to_string(roles, ', '), 'using', qual) order by policyname)
    from pg_policies where schemaname = 'public' and tablename = :'t'), '[]'::json));`
function psqlPolicies(cfg, tables) {
  let url
  try {
    url = new URL(cfg.databaseUrl)
  } catch {
    return { error: 'the database URL is not a postgres:// address' }
  }
  const env = {
    ...process.env,
    PGHOST: url.hostname.replace(/^\[|\]$/g, ''),
    PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)) || 'postgres',
    PGCONNECT_TIMEOUT: '10',
    ...(url.searchParams.get('sslmode') ? { PGSSLMODE: url.searchParams.get('sslmode') } : {}),
  }
  const out = {}
  try {
    for (const table of tables) {
      const text = execFileSync('psql', ['-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-v', `t=${table}`], { env, input: PSQL, encoding: 'utf8', timeout: 20_000, stdio: ['pipe', 'pipe', 'pipe'] })
      const live = JSON.parse(text.trim())
      out[table] = { rls: live.rls, policies: live.policies.map((p) => ({ ...p, open: isOpen(p.using) })) }
    }
    return out
  } catch (err) {
    return { error: err.code === 'ENOENT' ? 'install "pg" in this project (or psql) to read the live policies' : `could not read the live policies: ${String(err.stderr || err.message).trim().split('\n')[0]}` }
  }
}

// A read rule is open when it never looks at who is asking: true, or no auth.uid() / auth.jwt() /
// auth.role() and no subquery that could check membership.
function isOpen(using) {
  if (using == null) return false
  const expr = using.replace(/\s+/g, ' ').trim().toLowerCase()
  if (/^\(*\s*true\s*\)*$/.test(expr)) return true
  return !/auth\.(uid|jwt|role)\s*\(|current_user|select\s/.test(expr)
}

function clause(text, word) {
  const at = word ? text.search(new RegExp(`\\b${word}\\s*\\(`, 'i')) : text.indexOf('(')
  if (at < 0) return null
  const start = text.indexOf('(', at)
  let depth = 0
  for (let i = start; i < text.length; i++) {
    if (text[i] === '(') depth++
    else if (text[i] === ')' && --depth === 0) return text.slice(start + 1, i).trim()
  }
  return null
}

// Statements without comments, split on semicolons outside dollar-quoted function bodies ($$ ... $$).
function statements(sql) {
  const text = sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
  const out = []
  let start = 0
  let quote = null
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '$') {
      const tag = text.slice(i).match(/^\$[A-Za-z_]*\$/)?.[0]
      if (tag && (quote === null || tag === quote)) {
        quote = quote === null ? tag : null
        i += tag.length - 1
        continue
      }
    }
    if (text[i] === ';' && quote === null) {
      out.push(text.slice(start, i))
      start = i + 1
    }
  }
  out.push(text.slice(start))
  return out.map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean)
}

// Database functions the migrations create: whether they take arguments, may write (volatile, the
// default) and skip row level security (security definer). Stranger only calls again functions
// that cannot write and need no arguments.
export function functionsIn(dir) {
  const out = new Map()
  if (!dir || !existsSync(dir)) return out
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    for (const sql of statements(readFileSync(join(dir, file), 'utf8'))) {
      const m = sql.match(/^create\s+(?:or\s+replace\s+)?function\s+([^\s(]+)\s*\(/i)
      if (!m) continue
      const args = clause(sql.slice(m.index + m[0].length - 1), '') ?? ''
      const head = sql.replace(/\$[A-Za-z_]*\$[\s\S]*?\$[A-Za-z_]*\$/g, ' ').toLowerCase()
      out.set(tableOf(m[1]), {
        args: args.trim().length > 0,
        volatile: !/\b(stable|immutable)\b/.test(head),
        definer: /\bsecurity\s+definer\b/.test(head),
        file,
      })
    }
  }
  return out
}

// Views the migrations create, and whether they run with the caller's rights (security_invoker).
// A view without it reads its tables as its creator, so row level security does not apply.
export function viewsIn(dir) {
  const out = new Map()
  if (!dir || !existsSync(dir)) return out
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    for (const sql of statements(readFileSync(join(dir, file), 'utf8'))) {
      const m = sql.match(/^create\s+(?:or\s+replace\s+)?view\s+([^\s(]+)([\s\S]*?)\bas\b/i)
      if (m) out.set(tableOf(m[1]), { invoker: /security_invoker\s*=\s*(true|on)/i.test(m[2]), file })
      const alter = sql.match(/^alter\s+view\s+([^\s]+)\s+set\s*\(([^)]*)\)/i)
      if (alter && out.has(tableOf(alter[1]))) out.get(tableOf(alter[1])).invoker = /security_invoker\s*=\s*(true|on)/i.test(alter[2])
    }
  }
  return out
}

const unquote = (name) => name.replace(/^"|"$/g, '')
const tableOf = (ref) => (ref ? unquote(ref.split('.').at(-1)) : null)
const sameTable = (a, b) => a != null && a.toLowerCase() === b.toLowerCase()
