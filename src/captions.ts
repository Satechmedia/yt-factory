import type { AspectRatio, Script, VisualScene, WordTiming } from "./types.ts";

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
        return `{\\c${accent}\\b1\\fscx108\\fscy108}${safe}{\\c&H00FFFFFF&\\b0\\fscx100\\fscy100}`;
      }
      return `{\\c&H00B8C4D0&}${safe}{\\c&H00FFFFFF&}`;
    })
    .join(" ");
}

export function buildKineticAss(input: {
  script: Script;
  words: WordTiming[];
  scenes: VisualScene[];
  duration: number;
  aspect: AspectRatio;
  fontName: string;
}): string {
  const { words, scenes, duration, aspect, fontName } = input;
  const size = aspect === "16:9" ? { width: 1920, height: 1080 } : { width: 1080, height: 1920 };
  const hookSize = aspect === "9:16" ? 86 : 74;
  const captionSize = aspect === "9:16" ? 62 : 54;
  const labelSize = aspect === "9:16" ? 30 : 26;
  const wrap = aspect === "9:16" ? 22 : 34;
  const captionMargin = aspect === "9:16" ? 280 : 160;
  const gold = "&H005AC1F4";

  const lines = wrapWordLines(words, wrap);
  const blocks: WordTiming[][][] = [];
  for (let i = 0; i < lines.length; i += 2) {
    blocks.push(lines.slice(i, i + 2));
  }

  const events: string[] = [];

  for (const scene of scenes) {
    events.push(
      `Dialogue: 0,${assTime(scene.start)},${assTime(scene.end)},Label,,0,0,0,,${escapeAss(scene.label)}`,
    );
  }

  const hookEnd = scenes.find((scene) => scene.part !== "hook")?.start ?? Math.min(2, duration);
  events.push(
    `Dialogue: 1,${assTime(0)},${assTime(Math.max(hookEnd, 1.6))},Hook,,0,0,0,,${escapeAss(input.script.hook)}`,
  );

  for (const block of blocks) {
    const flat = block.flat();
    if (flat.length === 0) {
      continue;
    }
    const blockStart = flat[0].start;
    const isHookBlock = blockStart < hookEnd - 0.05;
    if (isHookBlock) {
      continue;
    }

    for (let i = 0; i < flat.length; i += 1) {
      const word = flat[i];
      const start = i === 0 ? word.start : word.start;
      const end = i === flat.length - 1 ? word.end + 0.12 : flat[i + 1].start;
      const rendered = block
        .map((line) => {
          const local = line.findIndex((item) => item === word);
          const accent = rgbToAss(
            scenes.find((scene) => start >= scene.start && start < scene.end)?.accent ?? "0xf4c15a",
          );
          return highlightLine(line, local, accent);
        })
        .join("\\N");
      events.push(
        `Dialogue: 0,${assTime(start)},${assTime(Math.min(end, duration))},Caption,,0,0,0,,${rendered}`,
      );
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
    `Style: Hook,${fontName},${hookSize},${gold},&H000000FF,&H00101820,&H64000000,-1,0,0,0,100,100,0,0,1,6,0,5,70,70,0,1`,
    `Style: Caption,${fontName},${captionSize},&H00FFFFFF,&H000000FF,&H00101820,&H66000000,-1,0,0,0,100,100,0,0,1,5,0,2,70,70,${captionMargin},1`,
    `Style: Label,${fontName},${labelSize},&H00D6F0E4,&H000000FF,&H00101820,&H00000000,-1,0,0,0,100,100,2,0,1,0,0,8,48,48,96,1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...events,
    "",
  ].join("\n");
}
