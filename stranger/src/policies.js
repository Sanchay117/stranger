import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Reads a Supabase migrations folder in order and works out which row level security policies
// each table ends up with, so the fix brief can name the real policies instead of guessing.
// It only knows what the migrations say: a policy added by hand in the dashboard is invisible here.
export function readPolicies(dir, table) {
  const out = { files: 0, rls: null, ownerColumn: null, select: [] }
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
  for (const p of policies.values()) {
    if (p.command !== 'select' && p.command !== 'all') continue
    out.select.push({ ...p, open: isOpen(p.using) })
  }
  return out
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
  const at = text.search(new RegExp(`\\b${word}\\s*\\(`, 'i'))
  if (at < 0) return null
  const start = text.indexOf('(', at)
  let depth = 0
  for (let i = start; i < text.length; i++) {
    if (text[i] === '(') depth++
    else if (text[i] === ')' && --depth === 0) return text.slice(start + 1, i).trim()
  }
  return null
}

// Statements without comments. Good enough for policy DDL; it does not try to parse function bodies.
function statements(sql) {
  return sql
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(';')
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

const unquote = (name) => name.replace(/^"|"$/g, '')
const tableOf = (ref) => (ref ? unquote(ref.split('.').at(-1)) : null)
const sameTable = (a, b) => a != null && a.toLowerCase() === b.toLowerCase()
