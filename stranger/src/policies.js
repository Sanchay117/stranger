import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
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
        })
      }
    }
  }
  out.all = [...policies.values()].map((p) => ({ ...p, open: isOpen(p.using) }))
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
// Needs the "pg" package where Stranger runs; without it, or on any error, this says why and moves on.
export async function livePolicies(cfg, tables) {
  let pg
  try {
    const require = createRequire(join(cfg.root, 'package.json'))
    pg = (await import(pathToFileURL(require.resolve('pg')).href)).default
  } catch {
    return { error: 'install "pg" in this project to read the live policies' }
  }
  const client = new pg.Client({ connectionString: cfg.databaseUrl, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10_000 })
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
