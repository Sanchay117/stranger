import { staticFile } from "remotion";
import { TEASER_ANCHORS, TEASER_S } from "./beats.ts";
import { DEMO, TEASER } from "./script.ts";

export const FPS = 30;
/** Frames by which each demo scene fades up over the one before. */
export const OVERLAP = 12;
export const TEASER_FRAMES = TEASER_S * FPS;

/** Shortest each scene may run, in seconds, so the picture has room even when the line is short. */
const MIN_SECONDS: Record<string, number> = { "d-ask": 5.2, "d-close": 7.5 };

export interface Word {
  text: string;
  start: number;
  end: number;
}
export interface Take {
  file: string;
  seconds: number;
  words: Word[];
}
export interface Live {
  fps: number;
  seconds: number;
  /** The day it was filmed, as "24 Nov". */
  filmed?: string;
  marks: Record<string, number>;
  /** Boxes in the footage's own 1920 × 1080 pixels. */
  boxes?: Record<string, { x: number; y: number; w: number; h: number }>;
}

export interface Shot {
  id: string;
  /** First frame of the scene in the film. */
  from: number;
  frames: number;
  /** Frame, relative to the scene, where the narrator starts. */
  voiceAt: number;
  take?: Take;
  text: string;
}

export interface Voice {
  id: string;
  from: number;
  frames: number;
  file: string;
}

export interface Plan {
  shots: Shot[];
  voices: Voice[];
  teaser: Record<string, Take>;
  /** Second, in the teaser, at which each teaser line starts. */
  teaserAt: Record<string, number>;
  live: Live;
  total: number;
}

async function load<T>(path: string): Promise<T | undefined> {
  try {
    const res = await fetch(staticFile(path));
    return res.ok ? ((await res.json()) as T) : undefined;
  } catch {
    return undefined;
  }
}

const bare = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");

export async function makePlan(): Promise<Plan> {
  const manifest = await load<{ voice: string; lines: Record<string, Take> }>("vo/manifest.json");
  const live = await load<Live>("capture/live.json");
  if (!manifest || !live) throw new Error("Run npm run voice and npm run capture first.");

  const teaser: Record<string, Take> = {};
  const teaserAt: Record<string, number> = {};
  const voices: Voice[] = [];
  for (const line of TEASER) {
    const take = manifest.lines[line.id];
    const anchor = TEASER_ANCHORS[line.id];
    const word = take.words.find((w) => bare(w.text).startsWith(anchor.word));
    if (!word) throw new Error(`"${anchor.word}" is not in ${line.id}`);
    teaser[line.id] = take;
    teaserAt[line.id] = anchor.at - word.start;
    voices.push({ id: line.id, from: Math.round(teaserAt[line.id] * FPS), frames: Math.ceil(take.seconds * FPS) + 2, file: take.file });
  }

  const shots: Shot[] = [{ id: "teaser", from: 0, frames: TEASER_FRAMES, voiceAt: 0, text: "" }];
  let at = TEASER_FRAMES - OVERLAP;
  for (const line of DEMO) {
    const take = manifest.lines[line.id];
    if (!take) throw new Error(`no voice for ${line.id}: run npm run voice`);
    const lead = line.lead ?? 0.4;
    const tail = line.tail ?? 0.5;
    const frames = Math.max(Math.round((MIN_SECONDS[line.id] ?? 0) * FPS), Math.round((lead + take.seconds + tail) * FPS) + OVERLAP);
    const voiceAt = Math.round(lead * FPS) + OVERLAP;
    shots.push({ id: line.id, from: at, frames, voiceAt, take, text: line.text });
    voices.push({ id: line.id, from: at + voiceAt, frames: Math.ceil(take.seconds * FPS) + 2, file: take.file });
    at += frames - OVERLAP;
  }
  return { shots, voices, teaser, teaserAt, live, total: at + OVERLAP };
}

/** Frame, relative to the scene, at which the narrator starts the `nth` word beginning with `word`. */
export function cue(shot: Shot, word: string, nth = 0): number {
  const hits = shot.take?.words.filter((w) => bare(w.text).startsWith(word)) ?? [];
  const hit = hits[nth];
  if (!hit) throw new Error(`"${word}" is not in the ${shot.id} narration`);
  return shot.voiceAt + Math.round(hit.start * FPS);
}

/** Frame, relative to the scene, at which the narrator finishes the line. */
export function voiceEnd(shot: Shot): number {
  return shot.voiceAt + Math.round((shot.take?.seconds ?? 0) * FPS);
}

/** Film frame at which a teaser line reaches `word`. */
export function said(plan: Plan, id: string, word: string, nth = 0): number {
  const hits = plan.teaser[id].words.filter((w) => bare(w.text).startsWith(word));
  const hit = hits[nth];
  if (!hit) throw new Error(`"${word}" is not in the ${id} narration`);
  return Math.round((plan.teaserAt[id] + hit.start) * FPS);
}
