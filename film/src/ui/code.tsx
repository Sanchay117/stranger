import type { CSSProperties, ReactNode } from "react";
import { useCurrentFrame } from "remotion";
import { fonts, ink } from "../theme.ts";
import { clamp, easeOut, ramp } from "./kit.tsx";
import { interpolate } from "remotion";

const KEYWORDS = /^(create|policy|on|for|select|using|to|drop|if|exists|alter|table|enable|row|level|security|authenticated|with|check|insert|update|delete|and|or|not|null)$/i;

/** Colours one line of SQL: comments, strings, keywords, auth.uid(), and `true`. */
export function sqlTokens(line: string): ReactNode[] {
  if (/^\s*--/.test(line)) return [<span key="c" style={{ color: ink.faint, fontStyle: "italic" }}>{line}</span>];
  const out: ReactNode[] = [];
  const re = /("[^"]*"|'[^']*'|auth\.uid\(\)|\btrue\b|[A-Za-z_][A-Za-z_.]*|\s+|.)/g;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(line))) {
    const t = m[0];
    let color: string = ink.text;
    if (t.startsWith('"') || t.startsWith("'")) color = ink.canary;
    else if (t === "auth.uid()") color = ink.teal;
    else if (t === "true") color = ink.coral;
    else if (KEYWORDS.test(t)) color = ink.rose;
    else if (/^public\./.test(t)) color = "#9fb4ff";
    out.push(
      <span key={k++} style={{ color }}>
        {t}
      </span>,
    );
  }
  return out;
}

export interface CodeLine {
  text: string;
  /** Frame the line appears (typed when `type` is set). */
  at: number;
  type?: boolean;
  /** Frame from which the line is lit up as the point of the scene. */
  mark?: number;
  markColor?: string;
}

/** A code card's lines: typed or revealed, with a marker sweeping across the line that matters. */
export function Code({ lines, size = 30, cps = 70, style }: { lines: CodeLine[]; size?: number; cps?: number; style?: CSSProperties }) {
  const f = useCurrentFrame();
  return (
    <div style={{ fontFamily: fonts.mono, fontSize: size, lineHeight: 1.65, whiteSpace: "pre", ...style }}>
      {lines.map((l, i) => {
        if (f < l.at) return <div key={i} style={{ height: size * 1.65 }} />;
        const n = l.type ? Math.floor(((f - l.at) / 30) * cps) : l.text.length;
        const shown = l.text.slice(0, n);
        const lit = l.mark !== undefined && f >= l.mark;
        const sweep = l.mark !== undefined ? ramp(f, l.mark, 12) : 0;
        const color = l.markColor ?? ink.coral;
        return (
          <div key={i} style={{ position: "relative", opacity: l.type ? 1 : ramp(f, l.at, 8), height: size * 1.65 }}>
            {lit && <div style={{ position: "absolute", left: -14, top: 2, bottom: 2, width: `calc(${sweep * 100}% + 28px)`, background: `${color}24`, borderLeft: `4px solid ${color}`, borderRadius: 6 }} />}
            <span style={{ position: "relative" }}>{sqlTokens(shown)}</span>
          </div>
        );
      })}
    </div>
  );
}

export type TermKind = "cmd" | "out" | "dim" | "ok" | "bad" | "agent" | "tool" | "user" | "hook" | "blank";

export interface TermLine {
  at: number;
  kind: TermKind;
  text: string;
  /** Rows the line takes when it wraps. */
  rows?: number;
  /** Characters a second when typed (commands and the user's prompt). */
  cps?: number;
}

const PROMPT: Record<TermKind, { mark: string; color: string; text: string }> = {
  cmd: { mark: "$", color: ink.amber, text: ink.text },
  out: { mark: " ", color: ink.soft, text: ink.soft },
  dim: { mark: " ", color: ink.faint, text: ink.faint },
  ok: { mark: "✓", color: ink.clean, text: ink.text },
  bad: { mark: "✗", color: ink.leak, text: ink.text },
  agent: { mark: "●", color: ink.text, text: ink.text },
  tool: { mark: "●", color: ink.amber, text: ink.soft },
  user: { mark: ">", color: ink.canary, text: ink.text },
  hook: { mark: "▌", color: ink.coral, text: ink.text },
  blank: { mark: " ", color: ink.faint, text: ink.faint },
};

/**
 * A terminal's scrollback. Lines arrive at their frames; when they overflow the box, the older ones
 * slide up out of view, line by line.
 */
export function Term({ lines, height, size = 24, style }: { lines: TermLine[]; height: number; size?: number; style?: CSSProperties }) {
  const f = useCurrentFrame();
  const lh = size * 1.55;
  const shown = lines.filter((l) => f >= l.at);
  const total = shown.reduce((sum, l) => sum + (l.rows ?? 1) * lh * ramp(f, l.at, 8), 0);
  const offset = Math.max(0, total - height);
  return (
    <div style={{ position: "relative", height, overflow: "hidden", fontFamily: fonts.mono, fontSize: size, lineHeight: `${lh}px`, ...style }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, transform: `translateY(${-offset}px)` }}>
        {shown.map((l, i) => {
          const p = PROMPT[l.kind];
          const typed = l.kind === "cmd" || l.kind === "user";
          const n = typed ? Math.floor(((f - l.at) / 30) * (l.cps ?? 45)) : l.text.length;
          const caret = typed && n < l.text.length;
          const enter = interpolate(f, [l.at, l.at + 8], [0, 1], { ...clamp, easing: easeOut });
          const hook = l.kind === "hook";
          return (
            <div
              key={i}
              style={{
                display: "flex",
                gap: 14,
                minHeight: (l.rows ?? 1) * lh,
                opacity: typed ? 1 : enter,
                transform: typed ? undefined : `translateX(${(1 - enter) * -10}px)`,
                background: hook ? "rgba(255,94,87,0.12)" : undefined,
                borderRadius: hook ? 8 : undefined,
                margin: hook ? "0 -10px" : undefined,
                padding: hook ? "0 10px" : undefined,
              }}
            >
              <span style={{ color: p.color, width: size * 0.7, flexShrink: 0, textAlign: "center" }}>{p.mark}</span>
              <span style={{ color: p.text, whiteSpace: "pre-wrap", wordBreak: "break-word", fontWeight: l.kind === "agent" || hook ? 500 : 400 }}>
                {l.text.slice(0, n)}
                {caret && <span style={{ display: "inline-block", width: "0.55em", height: "1em", verticalAlign: "-0.12em", background: ink.text, opacity: 0.8, marginLeft: 2 }} />}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Frame at which a typed terminal line finishes. */
export const typedEnd = (l: TermLine) => l.at + Math.ceil((l.text.length / (l.cps ?? 45)) * 30);
