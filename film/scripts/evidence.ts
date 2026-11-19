// Copies Kane's own per-step screenshots out of its local evidence packs, so the film shows what
// Kane's browser really saw. Only screenshots and step summaries leave the pack: the network logs
// hold login tokens and stay where they are.
//
//   node scripts/evidence.ts                 every local session whose test name is stranger-*
//   writes public/kane/<test name>/<ordinal>.jpg (+ <ordinal>-annotated.png) and steps.json

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "kane");
const sessions = join(homedir(), ".testmuai", "kaneai", "sessions");

interface Step {
  ordinal: number;
  id: string;
  kind: string;
  status: string;
  summary: string;
  url?: string;
  shot: string;
  annotated?: string;
}

const index: Record<string, { session: string; started: string; steps: Step[] }> = {};

for (const id of readdirSync(sessions)) {
  const evDir = join(sessions, id, "evidence");
  if (!existsSync(evDir)) continue;
  const pack = readdirSync(evDir).find((f) => f.endsWith(".evidence"));
  if (!pack) continue;
  const tmp = mkdtempSync(join(tmpdir(), "kane-ev-"));
  try {
    const run = spawnSync("unzip", ["-q", "-o", join(evDir, pack), "tests/*/steps/*", "-d", tmp]);
    if (run.status !== 0) continue;
    const tests = readdirSync(join(tmp, "tests"));
    for (const test of tests) {
      // tests/stranger-probe-f5b2cc-6e3cc77d: keep the readable part, drop Kane's suffix.
      const name = test.replace(/-[0-9a-f]{8}$/, "");
      if (!name.startsWith("stranger-")) continue;
      const dest = join(out, name);
      mkdirSync(dest, { recursive: true });
      const steps: Step[] = [];
      for (const dir of readdirSync(join(tmp, "tests", test, "steps"))) {
        const from = join(tmp, "tests", test, "steps", dir);
        const info = JSON.parse(readFileSync(join(from, "step.json"), "utf8"));
        const ordinal = Number(info.ordinal ?? dir.split("-")[0]);
        const step: Step = { ordinal, id: info.id ?? dir, kind: info.kind ?? "", status: info.status ?? "", summary: info.summary ?? "", url: info.url, shot: "" };
        if (existsSync(join(from, "screenshot.jpg"))) {
          step.shot = `kane/${name}/${ordinal}.jpg`;
          copyFileSync(join(from, "screenshot.jpg"), join(root, "public", step.shot));
        }
        if (existsSync(join(from, "annotated.png"))) {
          step.annotated = `kane/${name}/${ordinal}-annotated.png`;
          copyFileSync(join(from, "annotated.png"), join(root, "public", step.annotated));
        }
        steps.push(step);
      }
      steps.sort((a, b) => a.ordinal - b.ordinal);
      const meta = JSON.parse(readFileSync(join(sessions, id, "session.json"), "utf8"));
      index[name] = { session: id, started: meta.started_at ?? "", steps };
      writeFileSync(join(dest, "steps.json"), JSON.stringify(index[name], null, 2) + "\n");
      console.log(`${name.padEnd(26)} ${steps.length} steps  (${id.slice(0, 8)}, ${meta.started_at})`);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
writeFileSync(join(out, "index.json"), JSON.stringify(index, null, 2) + "\n");
