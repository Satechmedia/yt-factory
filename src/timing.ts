import type { Script, VisualScene, WordTiming } from "./types.ts";

/** No visual shot should sit still longer than this. */
export const MAX_SHOT_SECONDS = 4;

export type ScriptPart = {
  key: string;
  label: string;
  part: "hook" | "beat" | "cta";
  text: string;
  start: number;
  end: number;
};

const LOOKS: Array<Pick<VisualScene, "bg0" | "bg1" | "accent" | "motif" | "gradient" | "punch">> =
  [
    {
      bg0: "0x06101c",
      bg1: "0x1f5f8a",
      accent: "0xf4c15a",
      motif: "slash",
      gradient: "radial",
      punch: "in",
    },
    {
      bg0: "0x031812",
      bg1: "0x0d7a58",
      accent: "0x7dffc8",
      motif: "ring",
      gradient: "linear",
      punch: "left",
    },
    {
      bg0: "0x101018",
      bg1: "0x2f5f9a",
      accent: "0x8ec8ff",
      motif: "bars",
      gradient: "circular",
      punch: "right",
    },
    {
      bg0: "0x2a0812",
      bg1: "0x8a2048",
      accent: "0xff8aa8",
      motif: "rise",
      gradient: "linear",
      punch: "up",
    },
    {
      bg0: "0x2a1404",
      bg1: "0x8a4a0c",
      accent: "0xffc040",
      motif: "stack",
      gradient: "radial",
      punch: "in",
    },
    {
      bg0: "0x082014",
      bg1: "0x1f7a40",
      accent: "0x8affb4",
      motif: "lane",
      gradient: "linear",
      punch: "left",
    },
    {
      bg0: "0x081828",
      bg1: "0x1f5ca0",
      accent: "0x74c0ff",
      motif: "pulse",
      gradient: "spiral",
      punch: "right",
    },
    {
      bg0: "0x180c2c",
      bg1: "0x5a38a0",
      accent: "0xe0b8ff",
      motif: "frame",
      gradient: "radial",
      punch: "in",
    },
    {
      bg0: "0x06140e",
      bg1: "0x2a6040",
      accent: "0xe8ff6a",
      motif: "frame",
      gradient: "circular",
      punch: "up",
    },
  ];

const BEAT_LABELS = [
  "WHAT IT IS",
  "CASH YOU CAN USE",
  "NOT THIS",
  "THE TRAP",
  "THE RULE",
  "THE TEST",
  "KEEP GOING",
  "ONE MORE",
];

export function tokenizeWords(text: string): string[] {
  return text
    .trim()
    .split(/\s+/)
    .map((token) => token.replace(/^[^A-Za-z0-9$]+|[^A-Za-z0-9$]+$/g, ""))
    .filter(Boolean);
}

function tokenWeight(token: string): number {
  const letters = token.replace(/[^A-Za-z0-9]/g, "");
  const syllables = Math.max(1, (letters.toLowerCase().match(/[aeiouy]+/g) ?? []).length);
  return 0.28 + syllables * 0.16 + Math.min(letters.length, 10) * 0.02;
}

export function estimateWordTimings(text: string, duration: number): WordTiming[] {
  const raw = text.trim().split(/\s+/).filter(Boolean);
  if (raw.length === 0 || duration <= 0) {
    return [];
  }

  const weights = raw.map((word) => {
    const pause = /[.!?]$/.test(word) ? 0.22 : /[,;:]$/.test(word) ? 0.1 : 0.04;
    return tokenWeight(word) + pause;
  });
  const total = weights.reduce((sum, w) => sum + w, 0);
  const words: WordTiming[] = [];
  let cursor = 0;
  for (let i = 0; i < raw.length; i += 1) {
    const slice = (weights[i] / total) * duration;
    const start = cursor;
    const end = i === raw.length - 1 ? duration : cursor + slice;
    words.push({ text: raw[i].replace(/[^\w$'-]+/g, ""), start, end });
    cursor = end;
  }
  return words;
}

export function scaleWordTimings(words: WordTiming[], tempo: number): WordTiming[] {
  if (tempo === 1) {
    return words;
  }
  return words.map((word) => ({
    ...word,
    start: word.start / tempo,
    end: word.end / tempo,
  }));
}

export function scriptParts(script: Script): Array<Omit<ScriptPart, "start" | "end">> {
  return [
    { key: "hook", label: "THE HOOK", part: "hook", text: script.hook },
    ...script.beats.map((text, index) => ({
      key: `beat-${index}`,
      label: BEAT_LABELS[index] ?? `BEAT ${index + 1}`,
      part: "beat" as const,
      text,
    })),
    { key: "cta", label: "DO THIS", part: "cta" as const, text: script.cta },
  ];
}

export function alignParts(script: Script, words: WordTiming[], duration: number): ScriptPart[] {
  const parts = scriptParts(script);
  if (words.length === 0) {
    const weights = parts.map((part) => Math.max(1, tokenizeWords(part.text).length));
    const total = weights.reduce((sum, w) => sum + w, 0);
    let cursor = 0;
    return parts.map((part, index) => {
      const slice = (weights[index] / total) * duration;
      const start = cursor;
      const end = index === parts.length - 1 ? duration : cursor + slice;
      cursor = end;
      return { ...part, start, end };
    });
  }

  let wordIndex = 0;
  let cursor = 0;
  return parts.map((part, index) => {
    const needed = Math.max(1, tokenizeWords(part.text).length);
    wordIndex = Math.min(words.length, wordIndex + needed);
    const endWord = words[Math.max(0, wordIndex - 1)];
    const start = cursor;
    const rawEnd = index === parts.length - 1 ? duration : endWord?.end ?? duration;
    const end = Math.max(rawEnd, start + 0.35);
    cursor = end;
    return { ...part, start, end: Math.min(end, duration) };
  });
}

export function splitSpan(start: number, end: number, max = MAX_SHOT_SECONDS): Array<[number, number]> {
  const duration = end - start;
  if (duration <= max + 0.05) {
    return [[start, end]];
  }
  const count = Math.ceil(duration / max);
  const slice = duration / count;
  return Array.from({ length: count }, (_, i) => {
    const from = start + slice * i;
    const to = i === count - 1 ? end : start + slice * (i + 1);
    return [from, to] as [number, number];
  });
}

export function planScenes(
  script: Script,
  duration: number,
  words: WordTiming[],
): VisualScene[] {
  const parts = alignParts(script, words, duration);
  const scenes: VisualScene[] = [];

  for (const part of parts) {
    for (const [start, end] of splitSpan(part.start, part.end)) {
      const look = LOOKS[scenes.length % LOOKS.length];
      scenes.push({
        index: scenes.length,
        label: part.label,
        part: part.part,
        start,
        end,
        ...look,
      });
    }
  }

  if (scenes.length > 0) {
    scenes[0].start = 0;
    scenes[scenes.length - 1].end = duration;
  }

  return scenes;
}

export function narrationText(hook: string, beats: string[], cta: string): string {
  return [hook, ...beats, cta]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
}
