import { continueRender, delayRender, staticFile } from "remotion";
import { FACES } from "./faces.ts";

// The site's own type and colours (demo/site/site.css, dark theme), so the film and the page are
// one thing: a deep navy night, and the canary family glowing on it.

if (typeof document !== "undefined") {
  const handle = delayRender("fonts");
  Promise.all(
    FACES.map(([family, file, weight]) => {
      const face = new FontFace(family, `url(${staticFile(`fonts/${file}`)})`, { weight, style: "normal" });
      return face.load().then(() => document.fonts.add(face));
    }),
  ).then(() => continueRender(handle));
}

export const fonts = {
  display: "'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif",
  text: "'Figtree', ui-sans-serif, system-ui, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, Menlo, monospace",
};

export const ink = {
  night: "#0b0f1d",
  deep: "#161c31",
  card: "#121829",
  line: "#252c44",
  text: "#eceef5",
  soft: "#a9aec2",
  faint: "#737a92",
  // The one gradient family: canary, amber, coral, rose.
  canary: "#ffcf33",
  amber: "#ffa21f",
  coral: "#ff5e57",
  rose: "#ff8fb3",
  // Functional: the stranger's control row, a leak, a clean run.
  teal: "#2bb3a3",
  leak: "#ef5a5f",
  clean: "#34b384",
  // Duebook's cream, for the app's own windows.
  paper: "#faf7f2",
  duebook: "#e8590c",
};

export const gradient = `linear-gradient(100deg, ${ink.canary} 0%, ${ink.amber} 38%, ${ink.coral} 72%, ${ink.rose} 100%)`;
