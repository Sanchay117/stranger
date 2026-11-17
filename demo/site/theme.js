// Light and dark themes for the Stranger page and Duebook (same origin, so one choice covers both).
// The <head> of each page sets data-theme before the first paint (no flash); this module runs the switch.
// Until someone picks a theme, the page follows the system setting, live.

const KEY = 'stranger-theme'
const root = document.documentElement
const system = matchMedia('(prefers-color-scheme: dark)')
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches

function saved() {
  try {
    const t = localStorage.getItem(KEY)
    return t === 'light' || t === 'dark' ? t : null
  } catch {
    return null
  }
}

export const currentTheme = () => (root.dataset.theme === 'dark' ? 'dark' : 'light')

function sync() {
  const dark = currentTheme() === 'dark'
  root.style.colorScheme = dark ? 'dark' : 'light'
  for (const el of document.querySelectorAll('[data-theme-switch]')) {
    el.setAttribute('aria-checked', String(dark))
    el.title = dark ? 'Switch to light mode' : 'Switch to dark mode'
  }
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.content = getComputedStyle(root).getPropertyValue('--theme-color').trim() || meta.content
}

// From a click, the new theme grows out of the switch as a circle. Otherwise colours just ease across.
function apply(theme, from) {
  if (theme === currentTheme()) return
  const swap = () => {
    root.dataset.theme = theme
    sync()
  }
  if (!from || still() || !document.startViewTransition) {
    root.classList.add('theme-easing')
    swap()
    setTimeout(() => root.classList.remove('theme-easing'), 450)
    return
  }
  const r = from.getBoundingClientRect()
  const x = r.left + r.width / 2
  const y = r.top + r.height / 2
  const reach = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))
  document.startViewTransition(swap).ready.then(() => {
    root.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${reach}px at ${x}px ${y}px)`] },
      { duration: 620, easing: 'cubic-bezier(.22, 1, .36, 1)', pseudoElement: '::view-transition-new(root)' },
    )
  })
}

export function setTheme(theme, from) {
  try {
    localStorage.setItem(KEY, theme)
  } catch {}
  apply(theme, from)
}

// Wire up one switch (a button with data-theme-switch). Safe to call more than once per element.
export function bindSwitch(el) {
  if (!el || el.dataset.themeBound) return
  el.dataset.themeBound = '1'
  el.addEventListener('click', () => setTheme(currentTheme() === 'dark' ? 'light' : 'dark', el))
  sync()
}

let started = false
export function initTheme() {
  if (started) return
  started = true
  if (!root.dataset.theme) root.dataset.theme = saved() ?? (system.matches ? 'dark' : 'light')
  system.addEventListener('change', (e) => {
    if (!saved()) apply(e.matches ? 'dark' : 'light')
  })
  // Another tab changed it.
  addEventListener('storage', (e) => {
    if (e.key === KEY && (e.newValue === 'light' || e.newValue === 'dark')) apply(e.newValue)
  })
  document.querySelectorAll('[data-theme-switch]').forEach(bindSwitch)
  sync()
}
