import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderDemo, verifyEvidence } from '../src/verify.js'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

test('verifyEvidence passes on the real Stranger repository evidence', async () => {
  const res = await verifyEvidence(repoRoot)
  assert.equal(res.ok, true, `unexpected errors: ${res.errors.join('; ')}`)
  assert.ok(res.hashedFiles >= 30)
  assert.equal(res.bench.bugsCaught, 9)
  assert.equal(res.bench.bugsTotal, 9)
  assert.equal(res.bench.controlClean, true)
  assert.equal(res.bench.saved, 10)
  assert.ok(res.savedRuns.count >= 13)
  assert.ok(res.savedRuns.screenshots >= 300)
})

test('verifyEvidence rejects a leaked JWT in tracked .stranger/report.md', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'stranger-verify-'))
  try {
    mkdirSync(join(dir, '.stranger'), { recursive: true })
    writeFileSync(
      join(dir, '.stranger', 'history.jsonl'),
      JSON.stringify({ id: 'abc123', at: '2026-11-24T00:00:00Z', verdict: 'LEAK', why: 'test' }) + '\n',
    )
    writeFileSync(
      join(dir, '.stranger', 'report.md'),
      '# Stranger: LEAK\nBearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc123def456\n',
    )
    const res = await verifyEvidence(dir)
    assert.equal(res.ok, false)
    assert.ok(res.errors.some((e) => e.includes('JWT')))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('verifyEvidence rejects a missing screenshot in demo/public/runs/', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'stranger-verify-'))
  try {
    mkdirSync(join(dir, 'demo', 'public', 'runs', 'dead01'), { recursive: true })
    writeFileSync(
      join(dir, 'demo', 'public', 'runs', 'dead01', 'index.html'),
      '<span class="verdict LEAK">LEAK</span><img src="owner-1.jpg">',
    )
    const res = await verifyEvidence(dir)
    assert.equal(res.ok, false)
    assert.ok(res.errors.some((e) => e.includes('owner-1.jpg')))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('verifyEvidence rejects local user paths and dead /runs/ links in field/', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'stranger-verify-'))
  try {
    mkdirSync(join(dir, '.stranger'), { recursive: true })
    mkdirSync(join(dir, 'field'), { recursive: true })
    writeFileSync(
      join(dir, '.stranger', 'history.jsonl'),
      JSON.stringify({ id: 'abc123', at: '2026-11-24T00:00:00Z', verdict: 'CLEAN', why: 'ok' }) + '\n',
    )
    writeFileSync(
      join(dir, 'field', 'README.md'),
      'Ran in /Users/someone/secret-folder with link /runs/missing99/\n',
    )
    const res = await verifyEvidence(dir)
    assert.equal(res.ok, false)
    assert.ok(res.errors.some((e) => e.includes('local user directory path')))
    assert.ok(res.errors.some((e) => e.includes('/runs/missing99/')))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('renderDemo works standalone outside the Stranger repo without creating files', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'stranger-demo-'))
  try {
    const out = await renderDemo(dir)
    assert.equal(out.ok, true)
    assert.ok(out.text.includes('CVE-2025-48757'))
    assert.ok(out.text.includes('9 of 9 real bug classes caught'))
    assert.ok(out.text.includes('https://stranger-2yf3.vercel.app/duebook/?as=stranger'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
