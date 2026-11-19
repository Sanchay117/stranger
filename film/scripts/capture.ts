// Films the live site with Chrome's screencast, resampled to a constant 30 fps and encoded by
// ffmpeg: the Stranger page, then Duebook opened as the stranger, showing Maya's invoices.
// Writes:
//
//   public/capture/live.mp4    1920 × 1080 (a 1440 × 810 page at 4/3 scale)
//   public/capture/live.json   the second each part starts, and what the page said
//
//   node scripts/capture.ts [--url https://stranger-2yf3.vercel.app]

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "capture");
mkdirSync(outDir, { recursive: true });

const args = process.argv.slice(2);
const i = args.indexOf("--url");
const base = (i >= 0 ? args[i + 1] : "https://stranger-2yf3.vercel.app").replace(/\/$/, "");

const FPS = 30;
const VIEW = { width: 1440, height: 810 };
const SCALE = 4 / 3;
const FRAME = { w: Math.round(VIEW.width * SCALE), h: Math.round(VIEW.height * SCALE) };

const ffmpeg = spawn(
  "nice",
  ["-n", "10", "ffmpeg", "-y", "-loglevel", "error", "-f", "image2pipe", "-c:v", "mjpeg", "-framerate", String(FPS), "-i", "-",
   "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p", "-movflags", "+faststart", join(outDir, "live.mp4")],
  { stdio: ["pipe", "inherit", "inherit"] },
);
ffmpeg.stdin.on("error", (e) => console.log(`ffmpeg stdin: ${e.message}`));

// The screencast only sends a frame when the page changes, so each frame repeats until the next.
let t0 = 0;
let clockOffset = 0;
let written = 0;
let last: Buffer | null = null;
const fill = (until: number) => {
  const target = Math.floor((until - t0) * FPS);
  while (last && written < target) {
    ffmpeg.stdin.write(last);
    written++;
  }
};
const marks: Record<string, number> = {};
const notes: Record<string, string> = {};
const now = () => Math.round((Date.now() / 1000 - clockOffset - t0) * 100) / 100;
const mark = (name: string) => {
  marks[name] = now();
  console.log(`${marks[name].toFixed(2).padStart(7)}s  ${name}`);
};
const hold = (ms: number) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ channel: "chrome", headless: true, args: [`--force-device-scale-factor=${SCALE}`, "--enable-gpu-rasterization", "--ignore-gpu-blocklist"] });
const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: SCALE, colorScheme: "dark", reducedMotion: "no-preference" });
const page = await context.newPage();
page.on("pageerror", (error) => console.log("pageerror", error.message));
const cdp = await context.newCDPSession(page);

function jpegSize(buf: Buffer): { w: number; h: number } | null {
  for (let p = 2; p + 9 < buf.length; ) {
    if (buf[p] !== 0xff) return null;
    const marker = buf[p + 1];
    const len = buf.readUInt16BE(p + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return { h: buf.readUInt16BE(p + 5), w: buf.readUInt16BE(p + 7) };
    p += 2 + len;
  }
  return null;
}

cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
  await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  const jpeg = Buffer.from(data, "base64");
  const size = jpegSize(jpeg);
  if (!size || size.w !== FRAME.w || size.h !== FRAME.h) return;
  const ts = metadata.timestamp ?? Date.now() / 1000;
  if (!t0) {
    t0 = ts;
    clockOffset = Date.now() / 1000 - ts;
  }
  fill(ts);
  last = jpeg;
});

const CURSOR_CSS = `
  html { scrollbar-width: none; } ::-webkit-scrollbar { display: none; }
  #film-cursor { position: fixed; z-index: 10000; left: 0; top: 0; width: 24px; height: 24px; pointer-events: none;
    transition: transform 0.8s cubic-bezier(.65,0,.35,1); filter: drop-shadow(0 2px 3px rgba(0,0,0,.35)); }
  #film-cursor.press svg { transform: scale(.82); } #film-cursor svg { transition: transform .12s; }
`;
async function dress(x: number, y: number) {
  await page.addStyleTag({ content: CURSOR_CSS });
  await page.evaluate(([px, py]) => {
    const c = document.createElement("div");
    c.id = "film-cursor";
    c.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24"><path d="M4 2l15 9.5-6.6 1.4L16 20l-2.6 1.3-3.6-7.3L4 18.6z" fill="#141a2e" stroke="#fbfaf7" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
    c.style.transition = "none";
    c.style.transform = `translate(${px}px, ${py}px)`;
    document.body.appendChild(c);
    requestAnimationFrame(() => (c.style.transition = ""));
  }, [x, y]);
}
async function glideCursor(x: number, y: number) {
  await page.evaluate(([px, py]) => {
    document.getElementById("film-cursor")!.style.transform = `translate(${px}px, ${py}px)`;
  }, [x, y]);
  await hold(900);
}
async function glideScroll(to: number, ms: number) {
  await page.evaluate(
    ([goal, dur]) =>
      new Promise<void>((done) => {
        const y0 = scrollY;
        const start = performance.now();
        const step = (t: number) => {
          const p = Math.min(1, (t - start) / dur);
          const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
          scrollTo({ top: y0 + (goal - y0) * e, behavior: "instant" });
          if (p < 1) requestAnimationFrame(step);
          else done();
        };
        requestAnimationFrame(step);
      }),
    [to, ms],
  );
}

// Warm the caches, then film from a blank page in the site's own night colour.
await page.goto(`${base}/`, { waitUntil: "load" });
await page.goto(`${base}/duebook/`, { waitUntil: "load" });
await page.setContent(`<html><body style="margin:0;background:#0b0f1d"></body></html>`);
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 90, maxWidth: FRAME.w, maxHeight: FRAME.h, everyNthFrame: 1 });
while (!t0) await hold(20);
await hold(300);

try {
  mark("page");
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  await hold(5200);
  notes.page = ((await page.locator("h1").first().innerText().catch(() => "")) || "").replace(/\s+/g, " ");

  mark("duebook");
  await page.goto(`${base}/duebook/`, { waitUntil: "domcontentloaded" });
  const button = page.getByRole("button", { name: /open as a stranger/i });
  await button.waitFor({ timeout: 20_000 });
  await dress(VIEW.width * 0.7, VIEW.height * 0.85);
  await hold(500);
  const box = (await button.boundingBox())!;
  await glideCursor(box.x + box.width * 0.5, box.y + box.height * 0.6);
  await page.evaluate(() => document.getElementById("film-cursor")!.classList.add("press"));
  await button.click();
  mark("stranger");
  await hold(150);
  await page.evaluate(() => document.getElementById("film-cursor")?.classList.remove("press"));
  await page.getByText("Northwind Studio").first().waitFor({ timeout: 20_000 });
  mark("invoices");
  notes.invoices = ((await page.locator("main, #root").first().innerText().catch(() => "")) || "").replace(/\s+/g, " ").slice(0, 400);
  await glideCursor(VIEW.width * 0.86, VIEW.height * 0.9);
  await hold(1500);
  await glideScroll(260, 1800);
  await hold(2600);
  mark("end");
} finally {
  await cdp.send("Page.stopScreencast").catch(() => {});
  fill(Date.now() / 1000 - clockOffset);
  ffmpeg.stdin.end();
  await new Promise((r) => ffmpeg.on("close", r));
  await browser.close();
  writeFileSync(join(outDir, "live.json"), JSON.stringify({ fps: FPS, width: FRAME.w, height: FRAME.h, seconds: written / FPS, marks, notes }, null, 2) + "\n");
  console.log(`\n${(written / FPS).toFixed(1)}s of footage`);
  for (const [k, v] of Object.entries(notes)) console.log(`${k}: ${v}`);
}
