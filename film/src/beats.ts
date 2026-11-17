// The teaser's grid, shared by the score (scripts/music.ts) and the picture (scenes/Teaser.tsx),
// in seconds. 120 BPM: a beat is 0.5 s (15 frames), a bar 2 s (60 frames).

export const BEAT = 0.5;
export const BAR = 4 * BEAT;

/** The owner's three checks pass, on "Every check passes". */
export const CHECKS_S = [3.5, 4.0, 4.5];
/** The stranger's window lands, on "users". */
export const STRANGER_S = 6;
/** The canary drops into Maya's window. */
export const PLANT_S = 8;
/** The stranger's window scans for it, on the sixteenths. */
export const SCAN_S: [number, number] = [9, 12];
/** The canary shows up in the stranger's window. */
export const SEEN_S = 12;
/** Cut to Kane's own screenshot of it. */
export const KANE_S = 13;
/** The red box round the canary row, on "saw". */
export const BOX_S = 14.5;
export const DROP_S = 18;
/** The teaser's length; the demo fades up over its last frames. */
export const TEASER_S = 24;

/** Where each teaser line sits: the word that lands on a hit, and when. */
export const TEASER_ANCHORS: Record<string, { word: string; at: number }> = {
  "t-you": { word: "you", at: 0.4 },
  "t-pass": { word: "every", at: 3.4 },
  "t-users": { word: "users", at: STRANGER_S },
  "t-see": { word: "can", at: 8.4 },
  "t-kane": { word: "saw", at: BOX_S },
  "t-name": { word: "stranger", at: DROP_S + 0.05 },
};
