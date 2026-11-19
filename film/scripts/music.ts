// Composes the teaser's score in code (no samples, no licences): public/sfx/teaser.wav
//
// 120 BPM in D minor, so one bar is 2 s or 60 frames, and the picture in scenes/Teaser.tsx cuts on
// the same grid (src/beats.ts holds the shared hit times).
//
//   bars 0-1    a drone and a slow heartbeat; three bright bells as the owner's checks pass
//   bars 2-3    the pads come in; a zip and a knock as the stranger's window lands
//   bars 4-5    a bell as the canary is planted, then the stranger's window scanning on sixteenths
//   bars 6-7    a sour stab where the canary shows up, the cut to Kane's screenshot, the red box
//   bar 8       the build: a snare roll, a riser, one beat of silence
//   bars 9-10   the drop on "Stranger"
//   bar 11      D major ringing out under the narrator, into the demo's bed
//
//   node scripts/music.ts

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BAR, BEAT, BOX_S, CHECKS_S, DROP_S, KANE_S, PLANT_S, SCAN_S, SEEN_S, STRANGER_S } from "../src/beats.ts";

const SR = 48000;
const SIXTEENTH = BEAT / 4;
const LENGTH = 28;

type Bus = [Float32Array, Float32Array];
const bus = (): Bus => [new Float32Array(LENGTH * SR), new Float32Array(LENGTH * SR)];
const drums = bus();
const tonal = bus();
const send = bus();

let seed = 0x1a7e;
const noise = () => {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return ((seed >>> 0) / 0xffffffff) * 2 - 1;
};
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

function put(target: Bus, index: number, value: number, pan: number) {
  if (index < 0 || index >= target[0].length) return;
  target[0][index] += value * Math.cos(((pan + 1) * Math.PI) / 4);
  target[1][index] += value * Math.sin(((pan + 1) * Math.PI) / 4);
}

/** A band-limited saw step correction, so low notes do not alias. */
function blep(t: number, dt: number) {
  if (t < dt) {
    const x = t / dt;
    return x + x - x * x - 1;
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt;
    return x * x + x + x + 1;
  }
  return 0;
}

interface Tone {
  at: number;
  dur: number;
  hz: number;
  gain: number;
  pan?: number;
  attack?: number;
  release?: number;
  /** The low-pass opens at cutFrom and settles at cutTo over cutTime. */
  cutFrom: number;
  cutTo: number;
  cutTime?: number;
  detune?: number[];
  sine?: number;
  reverb?: number;
}

function tone({ at, dur, hz, gain, pan = 0, attack = 0.004, release = 0.06, cutFrom, cutTo, cutTime = 0.15, detune = [0], sine = 0, reverb = 0 }: Tone) {
  const total = Math.ceil((dur + release) * SR);
  const start = Math.round(at * SR);
  const dts = detune.map((cents) => (hz * Math.pow(2, cents / 1200)) / SR);
  const phases = detune.map((_, i) => (i * 0.37) % 1);
  let low = 0;
  let band = 0;
  let sinePhase = 0;
  for (let i = 0; i < total; i++) {
    const t = i / SR;
    let wave = 0;
    for (let v = 0; v < dts.length; v++) {
      phases[v] += dts[v];
      if (phases[v] >= 1) phases[v] -= 1;
      wave += 2 * phases[v] - 1 - blep(phases[v], dts[v]);
    }
    wave /= Math.sqrt(dts.length);
    sinePhase += (2 * Math.PI * hz) / SR;
    const cutoff = cutTo + (cutFrom - cutTo) * Math.exp(-t / cutTime);
    const f = 2 * Math.sin((Math.PI * Math.min(cutoff, 16000)) / SR);
    low += f * band;
    const high = wave - low - 0.7 * band;
    band += f * high;
    const env = Math.min(1, t / attack) * (t > dur ? Math.exp(-(t - dur) / (release / 3)) : 1);
    const sample = (low + Math.sin(sinePhase) * sine) * env * gain;
    put(tonal, start + i, sample, pan);
    if (reverb) put(send, start + i, sample * reverb, pan);
  }
}

const kicks: number[] = [];

function kick(at: number, gain = 1) {
  kicks.push(at);
  const start = Math.round(at * SR);
  let phase = 0;
  for (let i = 0; i < 0.36 * SR; i++) {
    const t = i / SR;
    phase += (2 * Math.PI * (45 + 125 * Math.exp(-t / 0.026))) / SR;
    const body = Math.sin(phase) * Math.exp(-t / 0.14);
    const click = t < 0.004 ? noise() * 0.35 * (1 - t / 0.004) : 0;
    put(drums, start + i, (body + click) * gain, 0);
  }
}

/** A pigeonhole struck: a dry wooden knock. */
function knock(at: number, gain = 1, pan = 0, pitch = 1) {
  const start = Math.round(at * SR);
  for (const [hz, life, level] of [[420, 0.04, 0.7], [910, 0.025, 0.4], [1570, 0.015, 0.25]]) {
    for (let i = 0; i < 0.16 * SR; i++) {
      const t = i / SR;
      const sample = Math.sin(2 * Math.PI * hz * pitch * t) * level * gain * Math.exp(-t / life);
      put(drums, start + i, sample, pan);
      put(send, start + i, sample * 0.3, pan);
    }
  }
}

/** A letter flicked into its slot: paper sliding, then the knock of the slot's back. */
function flick(at: number, gain = 1, pan = 0) {
  const start = Math.round((at - 0.07) * SR);
  let last = 0;
  for (let i = 0; i < 0.07 * SR; i++) {
    const p = i / (0.07 * SR);
    const white = noise();
    const high = white - last;
    last = white;
    put(drums, start + i, high * gain * 0.32 * p * p, pan);
  }
  knock(at, gain * 0.55, pan, 1.3 + 0.1 * Math.sin(at * 7));
}

/** A rubber cancel stamp: a dull slap with a low thump under it. */
function cancel(at: number, gain = 1) {
  const start = Math.round(at * SR);
  let phase = 0;
  let low = 0;
  for (let i = 0; i < 0.5 * SR; i++) {
    const t = i / SR;
    phase += (2 * Math.PI * (70 + 90 * Math.exp(-t / 0.03))) / SR;
    put(drums, start + i, Math.sin(phase) * gain * Math.exp(-t / 0.11), 0);
    low += 0.3 * (noise() - low);
    const slap = low * gain * 0.9 * Math.exp(-t / 0.025);
    put(drums, start + i, slap, 0);
    put(send, start + i, slap * 0.5, 0);
  }
}

/** Graphite on paper: a soft scratch that wanders while the line is drawn. */
function pencil(from: number, to: number, gain: number) {
  let low = 0;
  let band = 0;
  for (let i = Math.round(from * SR); i < Math.round(to * SR); i++) {
    const t = i / SR;
    const p = (t - from) / (to - from);
    const f = 2 * Math.sin((Math.PI * (2600 + 1400 * Math.sin(t * 23))) / SR);
    low += f * band;
    band += f * (noise() - low - 0.6 * band);
    const env = Math.min(1, p * 8) * Math.min(1, (1 - p) * 8) * (0.6 + 0.4 * Math.abs(Math.sin(t * 31)));
    put(drums, i, band * gain * env, 0.2 * Math.sin(t * 3));
  }
}

/** A dot landing on the map: a tiny high tick. */
function tick(at: number, gain: number, pan = 0) {
  const start = Math.round(at * SR);
  for (let i = 0; i < 0.03 * SR; i++) {
    const t = i / SR;
    put(drums, start + i, (Math.sin(2 * Math.PI * 3200 * t) * 0.6 + noise() * 0.4) * gain * Math.exp(-t / 0.006), pan);
  }
}

function hat(at: number, gain: number, pan = 0.15) {
  const start = Math.round(at * SR);
  let last = 0;
  for (let i = 0; i < 0.08 * SR; i++) {
    const t = i / SR;
    const white = noise();
    const high = white - last;
    last = white;
    put(drums, start + i, high * gain * Math.exp(-t / 0.022), pan);
  }
}

function clap(at: number, gain: number) {
  const start = Math.round(at * SR);
  let low = 0;
  for (let i = 0; i < 0.2 * SR; i++) {
    const t = i / SR;
    const hits = [0, 0.011, 0.023].reduce((sum, h) => sum + (t >= h ? Math.exp(-(t - h) / 0.009) : 0), 0) + Math.exp(-t / 0.075) * 0.7;
    const white = noise();
    low += 0.28 * (white - low);
    const sample = (white - low) * hits * gain;
    put(drums, start + i, sample, 0);
    put(send, start + i, sample * 0.35, 0);
  }
}

function tom(at: number, hz: number, gain: number) {
  const start = Math.round(at * SR);
  let phase = 0;
  for (let i = 0; i < 0.45 * SR; i++) {
    const t = i / SR;
    phase += (2 * Math.PI * hz * (1 + 0.5 * Math.exp(-t / 0.04))) / SR;
    const sample = Math.sin(phase) * gain * Math.exp(-t / 0.16);
    put(drums, start + i, sample, 0);
    put(send, start + i, sample * 0.3, 0);
  }
}

/** Noise climbing to a hit. */
function riser(from: number, to: number, gain: number) {
  const start = Math.round(from * SR);
  const total = Math.round((to - from) * SR);
  let low = 0;
  let band = 0;
  for (let i = 0; i < total; i++) {
    const p = i / total;
    const f = 2 * Math.sin((Math.PI * (300 + 7000 * p * p * p)) / SR);
    low += f * band;
    band += f * (noise() - low - 0.5 * band);
    const sample = band * gain * p * p;
    put(tonal, start + i, sample, Math.sin(p * 40) * 0.5);
    put(send, start + i, sample * 0.4, 0);
  }
}

/** The thread pulled through the case: a quick rising zip. */
function zip(from: number, to: number, gain: number) {
  const start = Math.round(from * SR);
  const total = Math.round((to - from) * SR);
  let low = 0;
  let band = 0;
  for (let i = 0; i < total; i++) {
    const p = i / total;
    const f = 2 * Math.sin((Math.PI * (900 + 5200 * p)) / SR);
    low += f * band;
    band += f * (noise() - low - 0.25 * band);
    const sample = band * gain * Math.sin(Math.PI * p) * (0.7 + 0.3 * Math.sin(i / 90));
    put(drums, start + i, sample, -0.6 + 1.2 * p);
    put(send, start + i, sample * 0.3, 0);
  }
}

/** A strike: a falling sub and a dark crash, sent to the reverb. */
function impact(at: number, gain: number) {
  const start = Math.round(at * SR);
  let phase = 0;
  let low = 0;
  for (let i = 0; i < 2.6 * SR; i++) {
    const t = i / SR;
    phase += (2 * Math.PI * (32 + 72 * Math.exp(-t / 0.09))) / SR;
    put(drums, start + i, Math.sin(phase) * gain * Math.exp(-t / 0.5), 0);
    low += 0.18 * (noise() - low);
    const crash = low * gain * 0.7 * Math.exp(-t / 0.42);
    put(drums, start + i, crash, 0);
    put(send, start + i, crash * 0.9, 0);
  }
}

/** A detour: a short stab that bends down, for every zone the shortest path drives back into. */
function detour(at: number, gain: number, pan: number) {
  const start = Math.round(at * SR);
  let phase = 0;
  for (let i = 0; i < 0.22 * SR; i++) {
    const t = i / SR;
    phase += (midi(74) * (1 - 0.25 * Math.min(1, t / 0.2))) / SR;
    const saw = 2 * (phase - Math.floor(phase + 0.5));
    const sample = saw * gain * Math.exp(-t / 0.06);
    put(tonal, start + i, sample, pan);
    put(send, start + i, sample * 0.35, pan);
  }
}

/** A soft bell, for the moment the case is threaded. */
function bell(at: number, note: number, gain: number, pan = 0) {
  const start = Math.round(at * SR);
  for (let i = 0; i < 2.2 * SR; i++) {
    const t = i / SR;
    const s = [1, 2.76, 5.4].reduce((a, m, k) => a + Math.sin(2 * Math.PI * midi(note) * m * t) * Math.exp(-t / (0.9 / (k + 1))) / (k + 1), 0);
    put(tonal, start + i, s * gain, pan);
    put(send, start + i, s * gain * 0.5, pan);
  }
}

// i, VI, iv, V: Dm, Bb, Gm, A.
const CHORDS = [
  { root: 38, notes: [62, 65, 69] },
  { root: 34, notes: [58, 62, 65] },
  { root: 31, notes: [58, 62, 67] },
  { root: 33, notes: [57, 61, 64] },
];
const chordAt = (bar: number) => CHORDS[bar % 4];
const SUPER = [-14, -7, 0, 7, 14];

// Bars 0-1: a drone and a slow heartbeat while the owner's window draws in.
for (const note of [38, 45]) {
  tone({ at: 0, dur: 7.6, hz: midi(note), gain: 0.2, attack: 1.2, release: 1.4, cutFrom: 160, cutTo: 620, cutTime: 5, detune: [-6, 6], sine: 0.35, reverb: 0.35 });
}
for (const b of [0, 1]) {
  kick(b * BAR, 0.38);
  kick(b * BAR + 2 * BEAT, 0.26);
}
// The owner's three checks pass: a bright D major triad, one bell each, with a tick.
CHECKS_S.forEach((at, i) => {
  bell(at, [74, 78, 81][i], 0.1, -0.35 + i * 0.35);
  tick(at, 0.1, -0.35 + i * 0.35);
});

// Bars 2-3: the pads come in; the stranger's window lands on "users".
for (let b = 2; b < 4; b++) {
  const chord = chordAt(b - 2);
  for (const note of chord.notes) tone({ at: b * BAR, dur: BAR, hz: midi(note - 12), gain: 0.07, attack: 0.5, release: 0.5, cutFrom: 300, cutTo: 1000, cutTime: 1.2, detune: SUPER, reverb: 0.4 });
  tone({ at: b * BAR, dur: BAR, hz: midi(chord.root), gain: 0.22, attack: 0.3, release: 0.4, cutFrom: 200, cutTo: 420, cutTime: 0.8, detune: [-5, 5], sine: 0.6 });
  kick(b * BAR, 0.5);
  kick(b * BAR + 2 * BEAT, 0.4);
}
zip(STRANGER_S - 0.4, STRANGER_S, 0.18);
knock(STRANGER_S, 0.9, 0.35, 0.85);
impact(STRANGER_S, 0.22);

// Bars 4-5: the canary is planted (a bell and its octave), then the stranger's window scans on the
// sixteenths, climbing, over an eighth-note bass.
bell(PLANT_S, 81, 0.13, -0.2);
bell(PLANT_S + 2 * SIXTEENTH, 86, 0.07, 0.2);
for (let b = 4; b < 6; b++) {
  const chord = chordAt(b - 4);
  for (let e = 0; e < 8; e++) tone({ at: b * BAR + e * 2 * SIXTEENTH, dur: 0.16, hz: midi(chord.root + 12), gain: 0.3, cutFrom: 700, cutTo: 300, cutTime: 0.05, detune: [-5, 5], sine: 0.5 });
  for (const note of chord.notes) tone({ at: b * BAR, dur: BAR, hz: midi(note - 12), gain: 0.06, attack: 0.3, release: 0.4, cutFrom: 700, cutTo: 700, detune: SUPER, reverb: 0.3 });
  kick(b * BAR, 0.6);
  kick(b * BAR + 2 * BEAT, 0.5);
  for (let k = 0; k < 4; k++) hat(b * BAR + k * BEAT + BEAT / 2, 0.09);
}
for (let at = SCAN_S[0], i = 0; at < SCAN_S[1] - 0.01; at += SIXTEENTH, i++) tick(at, 0.04 + 0.0025 * i, Math.sin(i * 1.3) * 0.5);

// Bars 6-7: the canary shows up in the stranger's window. A sour stab and a low hit, a zip into
// Kane's screenshot, a second stab with the red box; four on the floor under ticking sixteenths.
for (let b = 6; b < 8; b++) {
  const chord = chordAt(b - 6);
  for (let s = 0; s < 16; s++) {
    const note = chord.notes[[0, 1, 2, 1][s % 4]] + 12;
    tone({ at: b * BAR + s * SIXTEENTH, dur: 0.08, hz: midi(note), gain: 0.08, pan: s % 2 ? 0.35 : -0.35, cutFrom: 2400, cutTo: 500, cutTime: 0.06, reverb: 0.3 });
  }
  for (let e = 0; e < 8; e++) tone({ at: b * BAR + e * 2 * SIXTEENTH, dur: 0.16, hz: midi(chord.root + 12), gain: 0.32, cutFrom: 900, cutTo: 360, cutTime: 0.05, detune: [-6, 6], sine: 0.5 });
  for (let k = 0; k < 4; k++) kick(b * BAR + k * BEAT, 0.55);
  for (let k = 0; k < 4; k++) hat(b * BAR + k * BEAT + BEAT / 2, 0.13);
}
detour(SEEN_S, 0.2, -0.2);
detour(SEEN_S + SIXTEENTH, 0.14, 0.2);
impact(SEEN_S, 0.4);
zip(KANE_S - 0.35, KANE_S, 0.14);
detour(BOX_S, 0.18, 0.25);
knock(BOX_S, 0.9, 0, 0.7);

// Bar 8: the build. Climbing sixteenths, a snare roll, a riser, a beat of silence.
{
  const b = 8;
  const chord = chordAt(0);
  for (let s = 0; s < 16; s++) {
    const note = chord.notes[[0, 1, 2, 1][s % 4]] + 12 * (s % 8 > 3 ? 1 : 0);
    tone({ at: b * BAR + s * SIXTEENTH, dur: 0.08, hz: midi(note + 12), gain: 0.12 + 0.006 * s, pan: s % 2 ? 0.35 : -0.35, cutFrom: 1800 + 200 * s, cutTo: 500, cutTime: 0.06, reverb: 0.3 });
  }
  for (let e = 0; e < 8; e++) tone({ at: b * BAR + e * 2 * SIXTEENTH, dur: 0.16, hz: midi(chord.root + 12), gain: 0.36, cutFrom: 1400, cutTo: 420, cutTime: 0.06, detune: [-6, 6], sine: 0.5 });
  for (let k = 0; k < 3; k++) kick(b * BAR + k * BEAT, 0.7);
}
for (let s = 0; s < 8; s++) clap(DROP_S - 1.5 + s * SIXTEENTH, 0.08 + s * 0.03);
riser(DROP_S - 2, DROP_S - BEAT, 0.42);

// Bars 9-10: the drop on "Stranger".
impact(DROP_S, 1);
cancel(DROP_S, 0.7);
for (let b = 9; b < 11; b++) {
  const chord = chordAt(b - 9);
  for (let k = 0; k < 4; k++) kick(b * BAR + k * BEAT, 0.95);
  for (const k of [1, 3]) clap(b * BAR + k * BEAT, 0.34);
  for (let k = 0; k < 4; k++) hat(b * BAR + k * BEAT + BEAT / 2, 0.26);
  for (let s = 0; s < 16; s++) hat(b * BAR + s * SIXTEENTH, 0.05, s % 2 ? 0.3 : -0.3);
  for (let e = 0; e < 8; e++) tone({ at: b * BAR + e * 2 * SIXTEENTH, dur: 0.2, hz: midi(chord.root + 12), gain: 0.42, cutFrom: 1900, cutTo: 500, cutTime: 0.09, detune: [-7, 7], sine: 0.5 });
  for (const note of chord.notes) tone({ at: b * BAR, dur: BAR, hz: midi(note), gain: 0.11, attack: 0.02, release: 0.3, cutFrom: 3400, cutTo: 2200, cutTime: 0.4, detune: SUPER, reverb: 0.35 });
  for (const [s, i] of [[0, 2], [3, 1], [6, 0], [8, 2], [11, 1], [14, 2]]) {
    tone({ at: b * BAR + s * SIXTEENTH, dur: 0.14, hz: midi(chord.notes[i] + 12), gain: 0.13, release: 0.3, cutFrom: 5000, cutTo: 1700, cutTime: 0.08, detune: [-8, 8], sine: 0.8, reverb: 0.5 });
  }
}
// Bar 11: the minor mode resolves to D major and rings out under the narrator, into the demo.
const RESOLVE = 11 * BAR;
kick(RESOLVE, 0.8);
impact(RESOLVE, 0.3);
for (const note of [38, 50, 57, 62, 66, 69, 74]) {
  tone({ at: RESOLVE, dur: 2.6, hz: midi(note), gain: 0.11, attack: 0.01, release: 3.2, cutFrom: 4200, cutTo: 800, cutTime: 1.4, detune: SUPER, reverb: 0.6, sine: note < 45 ? 0.6 : 0 });
}

// The kick ducks everything tonal, which is what makes the drop pump.
function duck(target: Bus) {
  const sorted = [...kicks].sort((a, b) => a - b);
  let k = 0;
  for (let i = 0; i < target[0].length; i++) {
    const t = i / SR;
    while (k + 1 < sorted.length && sorted[k + 1] <= t) k++;
    const since = sorted[k] <= t ? t - sorted[k] : 1;
    const gain = 1 - 0.6 * Math.exp(-since / 0.09);
    target[0][i] *= gain;
    target[1][i] *= gain;
  }
}
duck(tonal);

// One beat of silence before the drop, so the name lands on nothing.
for (const target of [drums, tonal, send]) {
  for (let i = Math.round((DROP_S - BEAT) * SR); i < Math.round((DROP_S - 0.004) * SR); i++) {
    const fade = Math.max(0, 1 - (i - (DROP_S - BEAT) * SR) / (0.03 * SR));
    target[0][i] *= fade;
    target[1][i] *= fade;
  }
}

/** Parallel combs into series all-passes, a touch longer on the right. */
function reverb(input: Float32Array, spread: number) {
  const out = new Float32Array(input.length);
  for (const size of [1557, 1617, 1491, 1422, 1277, 1356]) {
    const line = new Float32Array(Math.round((size + spread) * 1.45));
    let at = 0;
    let damp = 0;
    for (let i = 0; i < input.length; i++) {
      const y = line[at];
      damp = 0.6 * damp + 0.4 * y;
      line[at] = input[i] + damp * 0.86;
      at = (at + 1) % line.length;
      out[i] += y * 0.16;
    }
  }
  for (const size of [556, 441, 341]) {
    const line = new Float32Array(size + spread);
    let at = 0;
    for (let i = 0; i < out.length; i++) {
      const delayed = line[at];
      const x = out[i];
      line[at] = x + delayed * 0.5;
      out[i] = delayed - x * 0.5;
      at = (at + 1) % line.length;
    }
  }
  return out;
}
const wetL = reverb(send[0], 0);
const wetR = reverb(send[1], 23);

const mix = bus();
for (let i = 0; i < mix[0].length; i++) {
  mix[0][i] = Math.tanh((drums[0][i] * 0.9 + tonal[0][i] + wetL[i] * 0.55) * 1.15);
  mix[1][i] = Math.tanh((drums[1][i] * 0.9 + tonal[1][i] + wetR[i] * 0.55) * 1.15);
}

// Fades the tail to nothing, then writes 16 bit stereo.
const fadeFrom = (LENGTH - 2.5) * SR;
for (let i = fadeFrom; i < mix[0].length; i++) {
  const gain = 1 - (i - fadeFrom) / (mix[0].length - fadeFrom);
  mix[0][i] *= gain;
  mix[1][i] *= gain;
}
let peak = 0;
for (let i = 0; i < mix[0].length; i++) peak = Math.max(peak, Math.abs(mix[0][i]), Math.abs(mix[1][i]));
const scale = 0.89 / peak;
const pcm = Buffer.alloc(44 + mix[0].length * 4);
pcm.write("RIFF", 0);
pcm.writeUInt32LE(36 + mix[0].length * 4, 4);
pcm.write("WAVEfmt ", 8);
pcm.writeUInt32LE(16, 16);
pcm.writeUInt16LE(1, 20);
pcm.writeUInt16LE(2, 22);
pcm.writeUInt32LE(SR, 24);
pcm.writeUInt32LE(SR * 4, 28);
pcm.writeUInt16LE(4, 32);
pcm.writeUInt16LE(16, 34);
pcm.write("data", 36);
pcm.writeUInt32LE(mix[0].length * 4, 40);
for (let i = 0; i < mix[0].length; i++) {
  pcm.writeInt16LE(Math.round(mix[0][i] * scale * 32767), 44 + i * 4);
  pcm.writeInt16LE(Math.round(mix[1][i] * scale * 32767), 46 + i * 4);
}
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "sfx");
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "teaser.wav"), pcm);
console.log(`teaser.wav  ${LENGTH}s, ${kicks.length} kicks, peak gain ${scale.toFixed(2)}`);
