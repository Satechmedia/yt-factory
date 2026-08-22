import type { AspectRatio, Script, VisualScene, WordTiming } from "./types.ts";
import { scriptParts, tokenizeWords } from "./timing.ts";

export function assTime(seconds: number): string {
  const cs = Math.max(0, Math.round(seconds * 100));
  const h = Math.floor(cs / 360_000);
  const m = Math.floor((cs % 360_000) / 6_000);
  const s = Math.floor((cs % 6_000) / 100);
  const c = cs % 100;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(c).padStart(2, "0")}`;
}

export function escapeAss(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\n/g, "\\N");
}

function rgbToAss(hex: string): string {
  const value = hex.replace(/^0x/, "").replace(/^#/, "");
  const r = value.slice(0, 2);
  const g = value.slice(2, 4);
  const b = value.slice(4, 6);
  return `&H00${b}${g}${r}`.toUpperCase();
}

function wrapWordLines(words: WordTiming[], maxChars: number): WordTiming[][] {
  const lines: WordTiming[][] = [];
  let current: WordTiming[] = [];
  let length = 0;
  for (const word of words) {
    const next = length === 0 ? word.text.length : length + 1 + word.text.length;
    if (current.length > 0 && next > maxChars) {
      lines.push(current);
      current = [word];
      length = word.text.length;
    } else {
      current.push(word);
      length = next;
    }
  }
  if (current.length > 0) {
    lines.push(current);
  }
  return lines;
}

function highlightLine(line: WordTiming[], activeIndex: number, accent: string): string {
  return line
    .map((word, index) => {
      const safe = escapeAss(word.text);
      if (index === activeIndex) {
        return `{\\c${accent}\\b1\\fscx110\\fscy110}${safe}{\\c&H00FFFFFF&\\b0\\fscx100\\fscy100}`;
      }
      return `{\\c&H00C6D0DA&}${safe}{\\c&H00FFFFFF&}`;
    })
    .join(" ");
}

function sliceWordsByScript(script: Script, words: WordTiming[]): WordTiming[][] {
  const parts = scriptParts(script);
  let index = 0;
  return parts.map((part) => {
    const needed = Math.max(1, tokenizeWords(part.text).length);
    const slice = words.slice(index, index + needed);
    index += needed;
    return slice;
  });
}

function sentenceGroups(partText: string, partWords: WordTiming[]): WordTiming[][] {
  const sentences = partText.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  if (sentences.length <= 1) {
    return [partWords];
  }
  const groups: WordTiming[][] = [];
  let index = 0;
  for (const sentence of sentences) {
    const needed = Math.max(1, tokenizeWords(sentence).length);
    groups.push(partWords.slice(index, index + needed));
    index += needed;
  }
  if (index < partWords.length) {
    groups.push(partWords.slice(index));
  }
  return groups.filter((group) => group.length > 0);
}

function accentAt(scenes: VisualScene[], time: number): string {
  const scene = scenes.find((item) => time >= item.start && time < item.end) ?? scenes[0];
  return rgbToAss(scene?.accent ?? "0xf4c15a");
}

export function buildKineticAss(input: {
  script: Script;
  words: WordTiming[];
  scenes: VisualScene[];
  duration: number;
  aspect: AspectRatio;
  fontName: string;
}): string {
  const { script, words, scenes, duration, aspect, fontName } = input;
  const size = aspect === "16:9" ? { width: 1920, height: 1080 } : { width: 1080, height: 1920 };
  const hookSize = aspect === "9:16" ? 88 : 76;
  const captionSize = aspect === "9:16" ? 64 : 56;
  const labelSize = aspect === "9:16" ? 32 : 28;
  const wrap = aspect === "9:16" ? 18 : 28;
  const gold = "&H005AC1F4";

  const events: string[] = [];
  for (const scene of scenes) {
    events.push(
      `Dialogue: 0,${assTime(scene.start)},${assTime(scene.end)},Label,,0,0,0,,${escapeAss(scene.label)}`,
    );
  }

  const hookUntil = Math.max(2.05, scenes.find((scene) => scene.part !== "hook")?.start ?? 2.05);
  events.push(
    `Dialogue: 1,${assTime(0)},${assTime(Math.min(hookUntil, duration))},Hook,,0,0,0,,${escapeAss(script.hook)}`,
  );

  const sliced = sliceWordsByScript(script, words);
  const parts = scriptParts(script);

  for (let p = 0; p < parts.length; p += 1) {
    if (parts[p].part === "hook") {
      continue;
    }
    const partWords = sliced[p] ?? [];
    if (partWords.length === 0) {
      continue;
    }
    for (const group of sentenceGroups(parts[p].text, partWords)) {
      const lines = wrapWordLines(group, wrap);
      for (let i = 0; i < lines.length; i += 2) {
        const block = lines.slice(i, i + 2);
        const flat = block.flat();
        for (let w = 0; w < flat.length; w += 1) {
          const word = flat[w];
          const start = Math.max(word.start, hookUntil);
          const end = w === flat.length - 1 ? word.end + 0.16 : flat[w + 1].start;
          if (end <= start) {
            continue;
          }
          const accent = accentAt(scenes, start);
          const rendered = block
            .map((line) => highlightLine(line, line.indexOf(word), accent))
            .join("\\N");
          events.push(
            `Dialogue: 0,${assTime(start)},${assTime(Math.min(end, duration))},Caption,,0,0,0,,${rendered}`,
          );
        }
      }
    }
  }

  return [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${size.width}`,
    `PlayResY: ${size.height}`,
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Hook,${fontName},${hookSize},${gold},&H000000FF,&H00101820,&H80000000,-1,0,0,0,100,100,0,0,1,7,0,5,64,64,0,1`,
    `Style: Caption,${fontName},${captionSize},&H00FFFFFF,&H000000FF,&H00101820,&H80000000,-1,0,0,0,100,100,0,0,1,6,0,5,64,64,90,1`,
    `Style: Label,${fontName},${labelSize},&H00F4F7FA,&H000000FF,&H00101820,&H00000000,-1,0,0,0,100,100,2,0,1,0,0,8,48,48,88,1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...events,
    "",
  ].join("\n");
}
