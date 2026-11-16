// The Stranger landing page: the living blob, the composer, the replay of a real Kane run, and the tabs.
import replay from './replay-afb57e.json'

const REPO = 'https://github.com/Sanchay117/stranger'
const NPX = 'npx github:Sanchay117/stranger'
const DEMO_HOST = `${location.host}/duebook`
const still = matchMedia('(prefers-reduced-motion: reduce)').matches
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

// ---------- The blob: one WebGL quad, a softly wobbling disc with fake 3D lighting ----------
;(function blob(host) {
  const canvas = document.createElement('canvas')
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true })
  if (!gl) {
    host.classList.add('fallback')
    return
  }
  host.appendChild(canvas)

  const vert = 'attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }'
  const frag = `
    precision highp float;
    uniform vec2 uRes; uniform float uTime; uniform vec2 uMouse;
    uniform vec3 c1; uniform vec3 c2; uniform vec3 c3; uniform vec3 c4;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
    }
    float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
    void main() {
      vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y);
      uv -= uMouse * 0.05;
      uv.x *= 0.82; // a little wider than tall, so more of the composer has colour behind it
      float t = uTime * 0.12;
      float d = length(uv);
      float ang = atan(uv.y, uv.x);
      float r = 0.33 + 0.055 * sin(2.0 * ang + t * 2.2) + 0.04 * sin(3.0 * ang - t * 1.6 + 1.3) + 0.025 * sin(5.0 * ang + t * 3.1 + 2.0);
      float inside = 1.0 - smoothstep(r - 0.004, r + 0.002, d);
      if (inside <= 0.0) { gl_FragColor = vec4(0.0); return; }
      float h = clamp(d / r, 0.0, 1.0);
      vec3 n = normalize(vec3(uv / r, sqrt(max(0.0, 1.0 - h * h)) + 0.15));
      vec2 q = uv * 2.4 + vec2(fbm(uv * 2.0 + t), fbm(uv * 2.0 - t + 3.1));
      float f = fbm(q + t * 0.6);
      vec3 col = mix(c1, c2, smoothstep(0.3, 0.68, f));
      col = mix(col, c3, smoothstep(0.45, 0.8, fbm(q * 1.3 - t)) * 0.95);
      col = mix(col, c4, smoothstep(0.62, 0.9, 1.0 - f) * 0.55);
      vec3 L = normalize(vec3(-0.45, 0.6, 0.7));
      float diff = 0.8 + 0.3 * dot(n, L);
      float spec = pow(max(0.0, dot(reflect(-L, n), vec3(0.0, 0.0, 1.0))), 22.0) * 0.3;
      col = col * diff + spec;
      col = mix(col, vec3(1.0), smoothstep(0.75, 1.0, h) * 0.18);
      gl_FragColor = vec4(col * inside, inside);
    }`

  const shader = (type, src) => {
    const s = gl.createShader(type)
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s))
    return s
  }
  let prog
  try {
    prog = gl.createProgram()
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, vert))
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, frag))
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog))
  } catch (err) {
    console.warn(err)
    canvas.remove()
    host.classList.add('fallback')
    return
  }
  gl.useProgram(prog)

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  const loc = gl.getAttribLocation(prog, 'p')
  gl.enableVertexAttribArray(loc)
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

  const u = (name) => gl.getUniformLocation(prog, name)
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
  // Same family as the CSS: canary, amber, coral, and a soft rose for depth.
  ;[['c1', '#ffcf33'], ['c2', '#ffa21f'], ['c3', '#ff5e57'], ['c4', '#ff8fb3']].forEach(([k, v]) =>
    gl.uniform3fv(u(k), hex(v)),
  )

  const mouse = [0, 0]
  const target = [0, 0]
  addEventListener(
    'pointermove',
    (e) => {
      target[0] = e.clientX / innerWidth - 0.5
      target[1] = 0.5 - e.clientY / innerHeight
    },
    { passive: true },
  )

  function size() {
    const dpr = Math.min(devicePixelRatio || 1, 2)
    const w = Math.round(canvas.clientWidth * dpr)
    const h = Math.round(canvas.clientHeight * dpr)
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
      gl.viewport(0, 0, w, h)
    }
  }

  let visible = true
  const start = performance.now()
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting
  }).observe(host)

  function frame(now) {
    if (visible && !document.hidden) {
      size()
      mouse[0] += (target[0] - mouse[0]) * 0.05
      mouse[1] += (target[1] - mouse[1]) * 0.05
      gl.uniform2f(u('uRes'), canvas.width, canvas.height)
      gl.uniform1f(u('uTime'), still ? 8 : (now - start) / 1000)
      gl.uniform2f(u('uMouse'), mouse[0], mouse[1])
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }
    if (!still) requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
})(document.getElementById('blob'))

// ---------- What to look for ----------
// The first chip is the live demo. The others write a config for your own app.
const LIVE = { label: "Maya's invoices", live: true }
const SCENARIOS = [
  { label: "Your ex's DMs", host: 'your-chat-app.lovable.app', plant: 'open a new chat and send a message containing the text', look: 'the inbox and every conversation in it' },
  { label: "Another clinic's patient notes", host: 'your-clinic.vercel.app', plant: 'add a patient called "Stranger check" with the text as the note', look: 'the patients list and each patient page' },
  { label: "The other team's API keys", host: 'your-dashboard.netlify.app', plant: 'create an API key and name it the text', look: 'the API keys page in settings' },
  { label: 'Half-written breakup texts', host: 'your-notes-app.lovable.app', plant: 'start a new draft and type the text into it', look: 'the drafts folder' },
  { label: "A rival shop's wholesale prices", host: 'your-shop-admin.vercel.app', plant: 'add a product called "Stranger check" with the text in its description', look: 'the products list and the price sheet' },
  { label: "Strangers' home addresses", host: 'your-store.lovable.app', plant: 'add a delivery address with the text as the first line', look: 'saved addresses and order history' },
]
const PAIRS = [
  [0, 1],
  [2, 3],
  [4, 5],
]

const input = document.getElementById('app')
const chipsEl = document.getElementById('chips')
const consoleEl = document.getElementById('console')
let chosen = LIVE
let pair = 0
let chipsTouched = false
input.value = DEMO_HOST

function drawChips() {
  const list = [LIVE, ...PAIRS[pair].map((i) => SCENARIOS[i])]
  if (chosen !== LIVE && !list.includes(chosen)) list.splice(1, 1, chosen)
  chipsEl.innerHTML = list
    .map(
      (s, n) =>
        `<button class="chip glass" type="button" style="--i:${n}" data-n="${s.live ? -1 : SCENARIOS.indexOf(s)}" aria-pressed="${s === chosen}">${esc(s.label)}${s.live ? '<span class="live">live</span>' : ''}</button>`,
    )
    .join('')
}
drawChips()
if (!still) {
  setInterval(() => {
    if (chipsTouched || !consoleEl.hidden) return
    pair = (pair + 1) % PAIRS.length
    drawChips()
  }, 6000)
}

chipsEl.addEventListener('click', (e) => {
  const chip = e.target.closest('.chip')
  if (!chip) return
  chipsTouched = true
  const n = Number(chip.dataset.n)
  const next = n < 0 ? LIVE : SCENARIOS[n]
  const wasDemo = isDemo(input.value)
  chosen = next
  if (chosen === LIVE) {
    input.value = DEMO_HOST
  } else {
    input.placeholder = chosen.host
    if (wasDemo) input.value = ''
  }
  drawChips()
  run()
})

// ---------- Mode: just tell me, or let my agent fix it ----------
let mode = 'tell'
const modeButtons = [...document.querySelectorAll('.mode [data-mode]')]
function setMode(next, focus) {
  mode = next
  modeButtons.forEach((b) => {
    const on = b.dataset.mode === mode
    b.setAttribute('aria-checked', String(on))
    b.tabIndex = on ? 0 : -1
    if (on && focus) b.focus()
  })
  if (!consoleEl.hidden) render({ instant: true })
}
modeButtons.forEach((b, i) => {
  b.addEventListener('click', () => setMode(b.dataset.mode))
  b.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    setMode(modeButtons[(i + 1) % modeButtons.length].dataset.mode, true)
  })
})
setMode('tell')

// ---------- The composer ----------
const bare = (v) => v.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '')
const isDemo = (v) => {
  const b = bare(v).toLowerCase()
  return b === '' ? false : b === DEMO_HOST.toLowerCase() || b.endsWith('/duebook') || b.includes('duebook')
}

document.getElementById('composer').addEventListener('submit', (e) => {
  e.preventDefault()
  if (isDemo(input.value)) chosen = LIVE
  else if (chosen === LIVE) chosen = SCENARIOS[PAIRS[pair][0]]
  drawChips()
  run()
})

function run() {
  consoleEl.hidden = false
  render({ instant: false })
  consoleEl.scrollIntoView({ block: 'nearest', behavior: still ? 'auto' : 'smooth' })
}

let playing = 0
function render({ instant }) {
  if (chosen === LIVE) renderReplay(instant)
  else renderConfig()
}

// ---------- The replay of a real run ----------
const mins = (s) => `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`

function step({ ok, text }) {
  const i = text.indexOf(': ')
  const verb = i > 0 ? text.slice(0, i) : ''
  const rest = i > 0 ? text.slice(i + 2) : text
  return `<div class="ln step${ok ? '' : ' bad'}"><span class="mk ${ok ? 'ok' : 'bad'}">${ok ? '✓' : '✗'}</span> <span class="verb">${esc(verb)}</span> ${esc(rest)}</div>`
}

function replayLines() {
  const r = replay
  const lines = [
    { html: `<div class="ln dim">$ ${NPX} run</div>` },
    { html: `<div class="ln dim">fresh canary <span class="hl">${esc(r.canary)}</span>, control ${esc(r.control)}</div>` },
    { html: `<details class="grp" open><summary class="ln head">1 · Kane signs in as ${esc(r.owner)}, the owner, and plants the canary</summary></details>`, wait: 380 },
    ...r.ownerRun.steps.map((s) => ({ html: step(s), group: true })),
    // Once the owner's part passes, fold it to one line so the stranger's part and the verdict fit.
    { fold: `<span class="dim"> · ${r.ownerRun.steps.length} steps ${r.ownerRun.status}, ${mins(r.ownerRun.seconds)}, ${r.ownerRun.credits} credits</span>`, wait: 420 },
    { html: `<div class="ln head">2 · Kane signs in as ${esc(r.stranger)} and looks for it</div>`, wait: 380 },
    ...r.strangerRun.steps.map((s) => ({ html: step(s), wait: s.ok ? undefined : 700 })),
    { html: `<div class="ln dim">  ${r.strangerRun.status} in ${mins(r.strangerRun.seconds)}, ${r.strangerRun.credits} credits</div>` },
    { html: `<div class="ln verdict"><span class="tag leak">LEAK</span>${esc(r.why)}</div>`, wait: 500 },
  ]
  if (mode === 'tell') {
    lines.push({ html: '<div class="ln dim">wrote .stranger/report.md and .stranger/FIX.md · exit 1</div>' })
  } else {
    lines.push(
      { html: '<div class="ln dim">wrote .stranger/FIX.md · exit 1</div>' },
      { html: '<div class="ln agent">Stop hook: FIX.md goes back to Claude Code. It can\'t finish until Stranger says CLEAN, up to 3 tries.</div>' },
    )
  }
  return lines
}

async function renderReplay(instant) {
  const token = ++playing
  const when = new Date(replay.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  const total = replay.ownerRun.seconds + replay.strangerRun.seconds
  const credits = Math.round(replay.ownerRun.credits + replay.strangerRun.credits)
  consoleEl.innerHTML = `
    <div class="console-bar">
      <span>Replay of a real Kane CLI run against Duebook on localhost, ${esc(when)}. Took ${mins(total)} and ${credits} credits; played back fast.</span>
      <button type="button" data-act="again">Replay</button>
    </div>
    <div class="console-body fixed" tabindex="0" aria-label="Kane run log"></div>
    <div class="console-actions" hidden>
      <a class="primary" href="/duebook/?as=stranger" target="_blank" rel="noopener">See it yourself, as the stranger ↗</a>
      <a href="${esc(replay.strangerRun.testUrl)}" target="_blank" rel="noopener">Kane's run page ↗</a>
      <a href="${REPO}/blob/main/.stranger/FIX.md" target="_blank" rel="noopener">The fix brief ↗</a>
    </div>
    <p class="console-note" hidden>The live Duebook stays leaky on purpose, so you can check the leak with your own eyes.</p>`
  const body = consoleEl.querySelector('.console-body')
  const reveal = () => consoleEl.querySelectorAll('[hidden]').forEach((el) => (el.hidden = false))
  const toBottom = () => (body.scrollTop = body.scrollHeight)
  for (const line of replayLines()) {
    if (token !== playing) return
    const group = body.querySelector('details.grp')
    if (line.fold) {
      group.open = false
      group.querySelector('summary').insertAdjacentHTML('beforeend', line.fold)
    } else {
      ;(line.group ? group : body).insertAdjacentHTML('beforeend', line.html)
    }
    toBottom()
    if (!instant && !still) await sleep(line.wait ?? 150)
  }
  if (token !== playing) return
  reveal()
  toBottom()
}

// ---------- Your own app: the config Stranger needs ----------
function highlight(json) {
  let out = ''
  let last = 0
  for (const m of json.matchAll(/"(?:[^"\\]|\\.)*"(\s*:)?/g)) {
    out += esc(json.slice(last, m.index))
    const key = m[1] !== undefined
    const str = key ? m[0].slice(0, -m[1].length) : m[0]
    out += `<span class="${key ? 'k' : 's'}">${esc(str)}</span>${key ? esc(m[1]) : ''}`
    last = m.index + m[0].length
  }
  return out + esc(json.slice(last))
}

function cmd(text, note) {
  return `<div class="cmd"><code>${esc(text)}</code><button type="button" data-copy="${esc(text)}">Copy</button></div>${note ? `<div class="ln dim">${esc(note)}</div>` : ''}`
}

function renderConfig() {
  ++playing
  const host = bare(input.value) || chosen.host
  const url = /^localhost|^127\.0\.0\.1/.test(host) ? `http://${host}` : `https://${host}`
  const json = `{
  "url": ${JSON.stringify(url)},
  "owner": { "email": "$OWNER_EMAIL", "password": "$OWNER_PASSWORD" },
  "stranger": { "email": "$STRANGER_EMAIL", "password": "$STRANGER_PASSWORD" },
  "plant": ${JSON.stringify(chosen.plant)},
  "look": ${JSON.stringify(chosen.look)}
}`
  const what = chosen.label[0].toLowerCase() + chosen.label.slice(1)
  const agent =
    mode === 'fix'
      ? cmd(`${NPX} install-claude`, 'adds the Stranger skill and the Stop hook to .claude/') + cmd('touch .stranger/armed', 'arms the hook: your agent can\'t finish a change until Stranger says CLEAN')
      : ''
  consoleEl.innerHTML = `
    <div class="console-bar">
      <span>Stranger for ${esc(host)}, looking for ${esc(what)}</span>
      <button type="button" data-copy-config>Copy config</button>
    </div>
    <div class="console-body">
      <div class="ln dim">stranger.config.json</div>
      <pre class="cfg">${highlight(json)}</pre>
      <div class="ln dim">.env: two test accounts you own on that app (OWNER_EMAIL, OWNER_PASSWORD, STRANGER_EMAIL, STRANGER_PASSWORD)</div>
      ${cmd('npm install -g @testmuai/kane-cli && kane-cli login')}
      ${cmd(`${NPX} run`, 'about 4 minutes and 50 Kane credits a check · exit 0 clean, 1 leak')}
      ${agent}
    </div>
    <p class="console-note">This page can't sign in to your app for you. Stranger runs on your machine, with your Kane CLI account and two test accounts you own.</p>`
  consoleEl.querySelector('[data-copy-config]').dataset.copy = json + '\n'
}

consoleEl.addEventListener('click', async (e) => {
  const again = e.target.closest('[data-act="again"]')
  if (again) return renderReplay(false)
  const copy = e.target.closest('[data-copy]')
  if (!copy) return
  try {
    await navigator.clipboard.writeText(copy.dataset.copy)
    const was = copy.textContent
    copy.textContent = 'Copied'
    setTimeout(() => (copy.textContent = was), 1400)
  } catch {
    copy.textContent = 'Select and copy'
  }
})

// ---------- Proof links ----------
document.getElementById('kane-run').href = replay.strangerRun.testUrl

// ---------- Tabs ----------
const tabs = [...document.querySelectorAll('[role="tab"]')]
function selectTab(tab, focus) {
  tabs.forEach((t) => {
    const on = t === tab
    t.setAttribute('aria-selected', String(on))
    t.tabIndex = on ? 0 : -1
    document.getElementById(t.getAttribute('aria-controls')).hidden = !on
  })
  if (focus) tab.focus()
}
tabs.forEach((t, i) => {
  t.addEventListener('click', () => selectTab(t))
  t.addEventListener('keydown', (e) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!d) return
    e.preventDefault()
    selectTab(tabs[(i + d + tabs.length) % tabs.length], true)
  })
})
