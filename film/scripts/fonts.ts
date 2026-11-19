// Copies the site's three faces (Bricolage Grotesque, Figtree, JetBrains Mono) from @fontsource
// into public/fonts, so renders never reach out to a font CDN.
//
//   node scripts/fonts.ts

import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FACES } from "../src/faces.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "fonts");
mkdirSync(out, { recursive: true });
for (const [, file, , pkg] of FACES) {
  copyFileSync(join(root, "node_modules", "@fontsource", pkg, "files", file), join(out, file));
  console.log(file);
}
