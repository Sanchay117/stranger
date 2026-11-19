import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

// Run folders hold Kane's working files, which include the test accounts' passwords in plain text.
const IGNORE = ['.stranger/runs/', '.stranger/armed', '.stranger/hook-state.json', '.stranger/last.json', '.testmuai/', '.stranger/guards/kane/output-*/']

// Adds any missing lines to .gitignore, only inside a git repo. Returns what it added.
export function ensureGitignore(root) {
  if (!existsSync(join(root, '.git'))) return []
  const file = join(root, '.gitignore')
  const text = existsSync(file) ? readFileSync(file, 'utf8') : ''
  const have = new Set(text.split('\n').map((l) => l.trim()))
  const missing = IGNORE.filter((l) => !have.has(l))
  if (!missing.length) return []
  const lead = text && !text.endsWith('\n') ? '\n' : ''
  writeFileSync(file, `${text}${lead}\n# Stranger: run folders hold test passwords\n${missing.join('\n')}\n`)
  return missing
}

const HOOK_COMMAND = 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/stranger-stop.js"'

// Copies the skill and the Stop hook into <root>/.claude and registers the hook. Safe to run twice.
export function installClaude(root) {
  const out = []
  const claude = join(root, '.claude')

  const skillDir = join(claude, 'skills', 'stranger')
  mkdirSync(skillDir, { recursive: true })
  copyFileSync(join(here, '..', 'skill', 'SKILL.md'), join(skillDir, 'SKILL.md'))
  out.push('Skill:     .claude/skills/stranger/SKILL.md')

  mkdirSync(join(claude, 'hooks'), { recursive: true })
  copyFileSync(join(here, '..', 'hooks', 'claude-stop.js'), join(claude, 'hooks', 'stranger-stop.js'))
  out.push('Stop hook: .claude/hooks/stranger-stop.js')

  const settingsFile = join(claude, 'settings.json')
  let settings = {}
  if (existsSync(settingsFile)) {
    try {
      settings = JSON.parse(readFileSync(settingsFile, 'utf8'))
    } catch {
      out.push('Could not read .claude/settings.json, so the hook is not registered. Add this Stop hook by hand:')
      out.push(`  ${HOOK_COMMAND}`)
      return out
    }
  }
  settings.hooks ??= {}
  settings.hooks.Stop ??= []
  const already = settings.hooks.Stop.some((group) => group.hooks?.some((h) => h.command === HOOK_COMMAND))
  if (!already) {
    settings.hooks.Stop.push({ hooks: [{ type: 'command', command: HOOK_COMMAND, timeout: 900 }] })
    writeFileSync(settingsFile, JSON.stringify(settings, null, 2) + '\n')
  }
  out.push(`Settings:  .claude/settings.json ${already ? '(hook already registered)' : '(Stop hook registered)'}`)
  return out
}
