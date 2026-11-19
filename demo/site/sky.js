// The page's pictures, all drawn in the browser:
//  - sky(): the hero's living sky, one WebGL quad with drifting clouds that part behind the copy and
//    gather around the tear;
//  - tear(): the ragged hole in that sky, through which Kane's screenshot shows;
//  - art(): print-style halftone skies behind the product cards, drawn once per size with one shared
//    WebGL context and copied into each card's own canvas.

const root = document.documentElement
const still = matchMedia('(prefers-reduced-motion: reduce)').matches
const isNight = () => (root.dataset.theme === 'dark' ? 1 : 0)
const onTheme = (fn) => {
  const mo = new MutationObserver(fn)
  mo.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
  return mo
}
const drop = (gl) => gl.getExtension('WEBGL_lose_context')?.loseContext()

const VERT = 'attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }'
const NOISE = `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
    return v;
  }`

function program(gl, frag) {
  const make = (type, src) => {
    const s = gl.createShader(type)
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s))
    return s
  }
  try {
    const prog = gl.createProgram()
    gl.attachShader(prog, make(gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, make(gl.FRAGMENT_SHADER, frag))
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog))
    gl.useProgram(prog)
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'p')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    const cache = new Map()
    return (name) => (cache.has(name) ? cache.get(name) : cache.set(name, gl.getUniformLocation(prog, name)).get(name))
  } catch (err) {
    console.warn(err)
    return null
  }
}

// ---------- The sky ----------
const SKY = `
  precision highp float;
  uniform vec2 uRes; uniform float uTime; uniform float uNight; uniform vec2 uMouse;
  uniform vec4 uText;  // the copy's box, 0..1 with y up
  uniform vec4 uTear;  // the tear's centre and half size, 0..1 with y up
  ${NOISE}
  void main() {
    vec2 uv = gl_FragCoord.xy / uRes;
    float asp = uRes.x / uRes.y;
    float t = uTime;

    vec3 top = mix(vec3(0.090, 0.255, 0.700), vec3(0.012, 0.030, 0.100), uNight);
    vec3 mid = mix(vec3(0.200, 0.440, 0.860), vec3(0.040, 0.085, 0.240), uNight);
    vec3 hor = mix(vec3(0.620, 0.780, 0.960), vec3(0.120, 0.190, 0.400), uNight);
    vec3 sky = mix(hor, mid, smoothstep(0.0, 0.5, uv.y));
    sky = mix(sky, top, smoothstep(0.45, 1.0, uv.y));

    // Stars, only at night.
    vec2 sp = floor(gl_FragCoord.xy / 3.0);
    float h = hash(sp);
    float star = step(0.9972, h) * (0.55 + 0.45 * sin(t * 1.7 + h * 80.0)) * smoothstep(0.25, 0.9, uv.y);
    sky += uNight * star * vec3(0.85, 0.9, 1.0);

    // Where clouds may form: a bank along the bottom, a ring around the tear, clear behind the copy.
    float cover = 0.3 + 0.42 * smoothstep(0.62, 0.0, uv.y);
    vec2 tc = (uv - uTear.xy) / max(uTear.zw, vec2(0.001));
    cover += 0.36 * smoothstep(1.9, 1.0, length(tc));
    vec2 nearest = clamp(uv, uText.xy, uText.zw);
    float away = length((uv - nearest) * vec2(asp, 1.0));
    cover -= 0.7 * (1.0 - smoothstep(0.0, 0.14, away));
    float thr = 1.0 - cover;

    vec2 p = vec2(uv.x * asp, uv.y) * 1.9 + vec2(t * 0.014, t * 0.002) + uMouse * 0.04;
    vec2 w = vec2(fbm(p * 0.5 + t * 0.005), fbm(p * 0.5 + vec2(5.2, 1.3) - t * 0.004));
    // Billows: folded noise turns soft edges into the round puffs of cumulus.
    float b = 0.0, a = 0.5;
    vec2 q = p * 2.6 + w * 1.4;
    for (int i = 0; i < 4; i++) { b += a * abs(noise(q) * 2.0 - 1.0); q = q * 2.07 + vec2(3.1, 1.7); a *= 0.5; }
    float n = fbm(p + w * 0.85) + 0.27 * (b - 0.45);
    float d = smoothstep(thr, thr + 0.07, n);

    // Light from the upper left: where the cloud thins toward the light, it is lit; where it thickens, shaded.
    float n2 = fbm(p + vec2(-0.06, 0.09) + w * 0.85) + 0.27 * (b - 0.45);
    float lit = clamp(0.55 + (n - n2) * 9.0 + 1.1 * (n - thr), 0.0, 1.0);
    // Thick middles sit a little darker, thin edges glow (a silver lining).
    float edge = 1.0 - smoothstep(0.0, 0.5, d);

    vec3 litC = mix(vec3(1.0, 0.99, 0.965), vec3(0.62, 0.69, 0.88), uNight);
    vec3 shadeC = mix(vec3(0.50, 0.59, 0.80), vec3(0.06, 0.09, 0.23), uNight);
    vec3 cloud = mix(shadeC, litC, lit);
    cloud = mix(cloud, litC, edge * 0.35);
    cloud += (1.0 - uNight) * vec3(0.035, 0.015, -0.02) * lit;

    vec3 col = mix(sky, cloud, d);
    gl_FragColor = vec4(col, 1.0);
  }`

// Returns a function that stops it. With { still: true } it draws one frame (and again on resize or theme).
export function sky(canvas, frame, copy, hole, opts = {}) {
  const none = () => {}
  if (!canvas || !frame) return none
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, powerPreference: 'low-power' })
  if (!gl) return none
  const u = program(gl, SKY)
  if (!u) return none
  const calm = still || !!opts.still
  let stopped = false

  const box = (el) => {
    const f = frame.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    return { x0: (r.left - f.left) / f.width, x1: (r.right - f.left) / f.width, y0: 1 - (r.bottom - f.top) / f.height, y1: 1 - (r.top - f.top) / f.height }
  }
  let text = [0, 0, 0, 0]
  // With no tear, the ring of cloud around it sits far off the canvas.
  let tear = [-9, -9, 0.1, 0.1]
  function measure() {
    // Below full resolution on purpose: clouds are soft, and this keeps laptops cool.
    const dpr = Math.min(devicePixelRatio || 1, 2)
    const scale = Math.min(1.25, 0.8 * dpr)
    const w = Math.max(1, Math.round(canvas.clientWidth * scale))
    const h = Math.max(1, Math.round(canvas.clientHeight * scale))
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
      gl.viewport(0, 0, w, h)
    }
    if (copy) {
      const b = box(copy)
      text = [b.x0, b.y0, b.x1, b.y1]
    }
    if (hole) {
      const b = box(hole)
      tear = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.x1 - b.x0) / 2, (b.y1 - b.y0) / 2]
    }
  }
  measure()
  const ro = new ResizeObserver(() => {
    measure()
    if (calm) draw(performance.now())
  })
  ro.observe(frame)

  const mouse = [0, 0]
  const target = [0, 0]
  const point = (e) => {
    target[0] = e.clientX / innerWidth - 0.5
    target[1] = 0.5 - e.clientY / innerHeight
  }
  addEventListener('pointermove', point, { passive: true })

  let visible = true
  const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting))
  io.observe(frame)
  let night = isNight()
  const start = performance.now()

  function draw(now) {
    if (stopped) return
    night += (isNight() - night) * (calm ? 1 : 0.12)
    mouse[0] += (target[0] - mouse[0]) * 0.04
    mouse[1] += (target[1] - mouse[1]) * 0.04
    gl.uniform2f(u('uRes'), canvas.width, canvas.height)
    gl.uniform1f(u('uTime'), calm ? 30 : 30 + (now - start) / 1000)
    gl.uniform1f(u('uNight'), night)
    gl.uniform2f(u('uMouse'), mouse[0], mouse[1])
    gl.uniform4f(u('uText'), ...text)
    gl.uniform4f(u('uTear'), ...tear)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }
  // Clouds drift slowly, so 30 frames a second is plenty.
  let odd = false
  let mo = null
  function frameLoop(now) {
    if (stopped) return
    odd = !odd
    if (odd && visible && !document.hidden) draw(now)
    requestAnimationFrame(frameLoop)
  }
  if (calm) {
    draw(performance.now())
    mo = onTheme(() => requestAnimationFrame(draw))
  } else {
    requestAnimationFrame(frameLoop)
  }
  return () => {
    stopped = true
    ro.disconnect()
    io.disconnect()
    mo?.disconnect()
    removeEventListener('pointermove', point)
    // The context stays with its canvas (a lost one could not be reused if the same canvas mounts again).
  }
}

// ---------- The tear ----------
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// A torn outline: a squarish blob with a slow wobble, small rips, and (for the paper's edge) fibres.
function ragged({ cx, cy, rx, ry, seed, fray = 0, points = 240 }) {
  const rand = rng(seed)
  const ph = [rand() * 6.3, rand() * 6.3, rand() * 6.3]
  const n = 3.6
  let d = ''
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2
    const c = Math.cos(a)
    const s = Math.sin(a)
    const k = Math.pow(Math.pow(Math.abs(c), n) + Math.pow(Math.abs(s), n), -1 / n)
    let r = k * (1 + 0.03 * Math.sin(2 * a + ph[0]) + 0.022 * Math.sin(5 * a + ph[1]) + 0.012 * Math.sin(13 * a + ph[2]))
    r *= 1 + (rand() - 0.5) * 0.016
    if (fray && rand() < 0.4) r *= 1 + rand() * fray
    d += `${i ? 'L' : 'M'}${(cx + rx * r * c).toFixed(1)} ${(cy + ry * r * s).toFixed(1)}`
  }
  return d + 'Z'
}

export function tear(svg) {
  if (!svg) return
  const set = (id, d) => svg.querySelector(`#${id}`)?.setAttribute('d', d)
  const hole = ragged({ cx: 390, cy: 265, rx: 398, ry: 266, seed: 11 })
  set('tear-in', hole)
  set('tear-shade', hole)
  set('tear-out', ragged({ cx: 390, cy: 265, rx: 412, ry: 280, seed: 11, fray: 0.028, points: 300 }))
  set('tear-out-2', ragged({ cx: 394, cy: 270, rx: 418, ry: 286, seed: 23, fray: 0.02, points: 260 }))
}

// ---------- Halftone art ----------
const HALFTONE = `
  precision highp float;
  uniform vec2 uRes; uniform float uSeed; uniform float uNight; uniform float uCell;
  ${NOISE}
  float cloud(vec2 uv) {
    vec2 p = vec2(uv.x * uRes.x / uRes.y, uv.y) * 1.7 + vec2(uSeed * 3.17, uSeed * 1.31);
    vec2 w = vec2(fbm(p * 0.7), fbm(p * 0.7 + vec2(4.3, 2.1)));
    float n = fbm(p + w * 1.15);
    return smoothstep(0.36, 0.84, n + 0.3 * (1.0 - uv.y) - 0.06);
  }
  void main() {
    // A screen turned 45 degrees, like print.
    vec2 g = gl_FragCoord.xy / uCell;
    vec2 rg = vec2(0.7071 * (g.x + g.y), 0.7071 * (g.y - g.x));
    vec2 id = floor(rg) + 0.5;
    vec2 f = rg - id;
    vec2 back = vec2(0.7071 * (id.x - id.y), 0.7071 * (id.x + id.y));
    vec2 cuv = back * uCell / uRes;
    float d = cloud(cuv);
    float tone = clamp(0.05 + d * 0.95, 0.0, 1.0);
    float r = 0.58 * sqrt(tone);
    float px = 1.0 / uCell;
    float dotv = 1.0 - smoothstep(r - px, r + px, length(f));

    vec3 lo = mix(vec3(0.075, 0.13, 0.74), vec3(0.025, 0.04, 0.17), uNight);
    vec3 hi = mix(vec3(0.16, 0.28, 0.98), vec3(0.06, 0.10, 0.33), uNight);
    vec3 bg = mix(lo, hi, gl_FragCoord.y / uRes.y);
    vec3 ink = mix(vec3(0.88, 0.92, 1.0), vec3(0.50, 0.58, 0.88), uNight);
    gl_FragColor = vec4(mix(bg, ink, dotv * (0.3 + 0.7 * d)), 1.0);
  }`

// Returns a function that stops it.
export function art(canvases) {
  const none = () => {}
  if (!canvases.length) return none
  const glc = document.createElement('canvas')
  const gl = glc.getContext('webgl', { preserveDrawingBuffer: true, antialias: false })
  if (!gl) return none
  const u = program(gl, HALFTONE)
  if (!u) return none

  function paint(c) {
    const dpr = Math.min(devicePixelRatio || 1, 2)
    const w = Math.round(c.clientWidth * dpr)
    const h = Math.round(c.clientHeight * dpr)
    if (!w || !h) return
    glc.width = w
    glc.height = h
    gl.viewport(0, 0, w, h)
    gl.uniform2f(u('uRes'), w, h)
    gl.uniform1f(u('uSeed'), Number(c.dataset.seed) || 1)
    gl.uniform1f(u('uNight'), isNight())
    gl.uniform1f(u('uCell'), 5.5 * dpr)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    c.width = w
    c.height = h
    c.getContext('2d').drawImage(glc, 0, 0)
  }

  const sizes = new WeakMap()
  const ro = new ResizeObserver((entries) => {
    for (const e of entries) {
      const key = `${Math.round(e.contentRect.width)}x${Math.round(e.contentRect.height)}`
      if (sizes.get(e.target) === key) continue
      sizes.set(e.target, key)
      paint(e.target)
    }
  })
  canvases.forEach((c) => ro.observe(c))
  const mo = onTheme(() => canvases.forEach(paint))
  return () => {
    ro.disconnect()
    mo.disconnect()
    drop(gl)
  }
}
