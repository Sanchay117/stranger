import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'
import { execFileSync } from 'node:child_process'

const TEXT = new Set(['.json', '.ndjson', '.jsonl', '.har', '.log', '.txt', '.yaml', '.yml', '.md', '.html', ''])
const ZIP = new Set(['.evidence', '.zip'])
const MAX_BYTES = 25 * 1024 * 1024

// Looks through a Kane run's session folder and evidence pack for a string.
// Kane records network and console logs there, so a hit means the browser received it,
// even if the page never showed it.
export function searchEvidence(sessionDir, needle) {
  if (!sessionDir || !existsSync(sessionDir)) return { searched: 0, hits: [] }
  const hits = []
  let searched = 0
  for (const file of walk(sessionDir, 4)) {
    const ext = extname(file).toLowerCase()
    if (ZIP.has(ext)) {
      for (const entry of zipEntries(file)) {
        if (!TEXT.has(extname(entry).toLowerCase())) continue
        const text = zipRead(file, entry)
        searched++
        if (text?.includes(needle)) hits.push(hit(`${file}#${entry}`, text, needle))
      }
    } else if (TEXT.has(ext)) {
      const text = readSmall(file)
      searched++
      if (text?.includes(needle)) hits.push(hit(file, text, needle))
    }
  }
  return { searched, hits }
}

function hit(where, text, needle) {
  const at = text.indexOf(needle)
  const before = text.slice(Math.max(0, at - 6000), at)
  const urls = [...before.matchAll(/"(?:url|request_url|requestUrl|name)"\s*:\s*"(https?:\/\/[^"]+)"/g)].map((m) => m[1])
  return {
    where,
    url: urls.at(-1) ?? null,
    snippet: text.slice(Math.max(0, at - 160), at + needle.length + 160).replace(/\s+/g, ' '),
  }
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
