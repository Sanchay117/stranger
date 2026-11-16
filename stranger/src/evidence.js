import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'
import { execFileSync } from 'node:child_process'

const ZIP = new Set(['.evidence', '.zip'])
const MAX_BYTES = 25 * 1024 * 1024
// Only what the browser received. Kane's own logs quote the objective, which contains the canary.
const NETWORK = /network[^/]*\.har$/i

// Looks through the network logs of a Kane run (in its session folder and evidence pack) for a
// string in a response body. A hit means the server sent it to this user, even if the page hid it.
export function searchEvidence(sessionDir, needle) {
  if (!sessionDir || !existsSync(sessionDir)) return { searched: 0, hits: [] }
  const hits = []
  let searched = 0
  for (const file of walk(sessionDir, 4)) {
    const ext = extname(file).toLowerCase()
    if (ZIP.has(ext)) {
      for (const entry of zipEntries(file)) {
        if (!NETWORK.test(entry)) continue
        searched++
        hits.push(...harHits(`${file}#${entry}`, zipRead(file, entry), needle))
      }
    } else if (NETWORK.test(file)) {
      searched++
      hits.push(...harHits(file, readSmall(file), needle))
    }
  }
  return { searched, hits }
}

// Supabase REST tables the page read during the run (from request URLs, which Kane always logs;
// it keeps response bodies only for some responses).
export function restTables(sessionDir) {
  if (!sessionDir || !existsSync(sessionDir)) return []
  const tables = new Set()
  for (const file of walk(sessionDir, 4)) {
    const texts = ZIP.has(extname(file).toLowerCase())
      ? zipEntries(file).filter((e) => NETWORK.test(e)).map((e) => zipRead(file, e))
      : NETWORK.test(file)
        ? [readSmall(file)]
        : []
    for (const text of texts) {
      try {
        for (const entry of JSON.parse(text)?.log?.entries ?? []) {
          const m = entry.request?.method === 'GET' && entry.request.url?.match(/\/rest\/v1\/([A-Za-z0-9_]+)/)
          if (m) tables.add(m[1])
        }
      } catch {}
    }
  }
  return [...tables]
}

// Responses (not requests) that carry the needle, with their URLs.
function harHits(where, text, needle) {
  if (!text?.includes(needle)) return []
  let har
  try {
    har = JSON.parse(text)
  } catch {
    return [{ where, url: null, snippet: around(text, needle) }]
  }
  const seen = new Set()
  const out = []
  for (const entry of har?.log?.entries ?? []) {
    const body = entry?.response?.content?.text
    if (typeof body !== 'string' || !body.includes(needle)) continue
    const url = entry.request?.url ?? null
    if (seen.has(url)) continue
    seen.add(url)
    out.push({ where, url, method: entry.request?.method ?? null, status: entry.response?.status ?? null, snippet: around(body, needle) })
  }
  return out
}

function around(text, needle) {
  const at = text.indexOf(needle)
  return text.slice(Math.max(0, at - 160), at + needle.length + 160).replace(/\s+/g, ' ')
}

function* walk(dir, depth) {
  let entries = []
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    const p = join(dir, e.name)
    if (e.isDirectory() && depth > 0) yield* walk(p, depth - 1)
    else if (e.isFile()) yield p
  }
}

function readSmall(file) {
  try {
    if (statSync(file).size > MAX_BYTES) return null
    return readFileSync(file, 'utf8')
  } catch {
    return null
  }
}

function zipEntries(file) {
  try {
    return execFileSync('unzip', ['-Z1', file], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).split('\n').filter(Boolean)
  } catch {
    return []
  }
}

function zipRead(file, entry) {
  try {
    return execFileSync('unzip', ['-p', file, entry], { encoding: 'utf8', maxBuffer: MAX_BYTES })
  } catch {
    return null
  }
}
