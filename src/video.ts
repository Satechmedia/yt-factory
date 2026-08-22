import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { AspectRatio, Script } from "./types.ts";

const FONT_CANDIDATES = [
  {
    file: "/usr/share/fonts/truetype/macos/Inter-Bold.ttf",
    name: "Inter",
    dir: "/usr/share/fonts/truetype/macos",
  },
  {
    file: "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    name: "Liberation Sans",
    dir: "/usr/share/fonts/truetype/liberation",
  },
  {
    file: "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    name: "DejaVu Sans",
    dir: "/usr/share/fonts/truetype/dejavu",
  },
];

export function resolveFont(): { name: string; dir: string } {
  const found = FONT_CANDIDATES.find((font) => existsSync(font.file));
  if (found) {
    return { name: found.name, dir: found.dir };
  }
  return { name: "sans-serif", dir: "/usr/share/fonts" };
}

export function videoSize(aspect: AspectRatio): { width: number; height: number } {
  return aspect === "16:9"
    ? { width: 1920, height: 1080 }
    : { width: 1080, height: 1920 };
}

function run(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    const err: string[] = [];
    child.stderr.on("data", (chunk: Buffer) => err.push(chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${bin} exited ${code}: ${err.join("").trim()}`));
    });
  });
}

export async function probeDurationSeconds(mediaPath: string): Promise<number> {
  const { stdout } = await new Promise<{ stdout: string }>((resolve, reject) => {
    const child = spawn(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=nw=1:nk=1",
        mediaPath,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    const out: string[] = [];
    const err: string[] = [];
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => err.push(chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout: out.join("") });
        return;
      }
      reject(new Error(`ffprobe exited ${code}: ${err.join("").trim()}`));
    });
  });
  const duration = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Could not read duration from ${mediaPath}`);
  }
  return duration;
}

function assTime(seconds: number): string {
  const cs = Math.max(0, Math.round(seconds * 100));
  const h = Math.floor(cs / 360_000);
  const m = Math.floor((cs % 360_000) / 6_000);
  const s = Math.floor((cs % 6_000) / 100);
  const c = cs % 100;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(c).padStart(2, "0")}`;
}

function escapeAss(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\n/g, "\\N");
}

function wrapCaption(text: string, maxChars: number): string {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines.slice(0, 3).join("\\N");
}

function wordWeight(text: string): number {
  return Math.max(1, text.trim().split(/\s+/).filter(Boolean).length);
}

export function buildAssCaptions(input: {
  script: Script;
  duration: number;
  aspect: AspectRatio;
  fontName: string;
}): string {
  const { script, duration, aspect, fontName } = input;
  const size = videoSize(aspect);
  const fontSize = aspect === "9:16" ? 68 : 64;
  const marginV = aspect === "9:16" ? 320 : 180;
  const wrap = aspect === "9:16" ? 28 : 42;

  const parts = [script.hook, ...script.beats, script.cta];
  const weights = parts.map(wordWeight);
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  const pad = 0.08;

  let cursor = pad;
  const usable = Math.max(duration - pad * 2, duration * 0.92);
  const events: string[] = [
    `Dialogue: 0,${assTime(0)},${assTime(duration)},Label,,0,0,0,,PLAIN-ENGLISH MONEY`,
  ];

  for (let i = 0; i < parts.length; i += 1) {
    const slice = usable * (weights[i] / totalWeight);
    const start = cursor;
    const end = i === parts.length - 1 ? duration - pad / 2 : cursor + slice;
    events.push(
      `Dialogue: 0,${assTime(start)},${assTime(end)},Caption,,0,0,0,,${escapeAss(wrapCaption(parts[i], wrap))}`,
    );
    cursor = end;
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
    `Style: Caption,${fontName},${fontSize},&H00FFFFFF,&H000000FF,&H00101820,&H64000000,-1,0,0,0,100,100,0,0,1,5,0,5,80,80,${marginV},1`,
    `Style: Label,${fontName},28,&H00D6F0E4,&H000000FF,&H00101820,&H00000000,-1,0,0,0,100,100,0,0,1,0,0,8,50,50,90,1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...events,
    "",
  ].join("\n");
}

export async function renderVideo(input: {
  script: Script;
  wavPath: string;
  mp4Path: string;
  assPath: string;
  aspect: AspectRatio;
}): Promise<{ duration: number }> {
  const duration = await probeDurationSeconds(input.wavPath);
  const font = resolveFont();
  const { width, height } = videoSize(input.aspect);
  await writeFile(
    input.assPath,
    buildAssCaptions({
      script: input.script,
      duration,
      aspect: input.aspect,
      fontName: font.name,
    }),
  );

  // Solid navy field plus a slow hue drift — original motion, no stock footage.
  const lavfi = `color=c=0x102a43:s=${width}x${height}:d=${duration.toFixed(3)}:r=30`;
  const assFilter = `ass=${input.assPath.replaceAll("\\", "/").replaceAll(":", "\\:")}:fontsdir=${font.dir}`;

  await run("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    lavfi,
    "-i",
    input.wavPath,
    "-vf",
    `hue=h=sin(2*PI*t/14)*10,${assFilter}`,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "96k",
    "-shortest",
    "-movflags",
    "+faststart",
    input.mp4Path,
  ]);

  return { duration };
}

export function artifactPaths(dir: string): {
  script: string;
  audio: string;
  video: string;
  captions: string;
} {
  return {
    script: path.join(dir, "script.md"),
    audio: path.join(dir, "voice.wav"),
    video: path.join(dir, "video.mp4"),
    captions: path.join(dir, "captions.ass"),
  };
}
