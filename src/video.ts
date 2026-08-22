import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildKineticAss } from "./captions.ts";
import { run } from "./run.ts";
import type { ArtifactPaths, AspectRatio, Script, VisualScene, WordTiming } from "./types.ts";

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

export async function probeDurationSeconds(mediaPath: string): Promise<number> {
  const { stdout } = await run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=nw=1:nk=1",
    mediaPath,
  ]);
  const duration = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Could not read duration from ${mediaPath}`);
  }
  return duration;
}

export async function probeMeanVolumeDb(mediaPath: string): Promise<number> {
  const { stderr } = await run("ffmpeg", ["-i", mediaPath, "-af", "volumedetect", "-f", "null", "-"]);
  const match = stderr.match(/mean_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/);
  if (!match) {
    throw new Error(`Could not read mean volume from ${mediaPath}`);
  }
  return Number.parseFloat(match[1]);
}

function motifFilters(scene: VisualScene): string[] {
  const a = scene.accent;
  const filters = [
    `drawbox=x=0:y=0:w=iw:h=18:color=${a}:t=fill`,
    `drawbox=x=0:y=ih-18:w=iw:h=18:color=${a}@0.65:t=fill`,
    `drawbox=x=(iw-460)/2:y=52:w=460:h=70:color=black@0.38:t=fill`,
  ];

  switch (scene.motif) {
    case "slash":
      filters.push(`drawbox=x=iw*0.05:y=0:w=iw*0.14:h=ih*0.42:color=${a}@0.32:t=fill`);
      filters.push(`drawbox=x=iw*0.70:y=ih*0.10:w=iw*0.20:h=iw*0.20:color=${a}@0.30:t=fill`);
      break;
    case "ring":
      filters.push(`drawbox=x=(iw-400)/2:y=ih*0.11:w=400:h=400:color=${a}@0.28:t=30`);
      filters.push(`drawbox=x=(iw-168)/2:y=ih*0.11+116:w=168:h=168:color=${a}@0.40:t=fill`);
      break;
    case "bars":
      filters.push(`drawbox=x=iw*0.12:y=ih*0.13:w=iw*0.72:h=52:color=${a}@0.50:t=fill`);
      filters.push(`drawbox=x=iw*0.12:y=ih*0.13+78:w=iw*0.54:h=52:color=${a}@0.32:t=fill`);
      filters.push(`drawbox=x=iw*0.12:y=ih*0.13+156:w=iw*0.36:h=52:color=${a}@0.18:t=fill`);
      break;
    case "rise":
      filters.push(`drawbox=x=iw*0.16:y=ih*0.26:w=70:h=ih*0.16:color=${a}@0.24:t=fill`);
      filters.push(`drawbox=x=iw*0.16+90:y=ih*0.20:w=70:h=ih*0.22:color=${a}@0.36:t=fill`);
      filters.push(`drawbox=x=iw*0.16+180:y=ih*0.13:w=70:h=ih*0.29:color=${a}@0.52:t=fill`);
      break;
    case "stack":
      filters.push(`drawbox=x=iw*0.10:y=ih*0.12:w=iw*0.80:h=140:color=white@0.10:t=fill`);
      filters.push(`drawbox=x=iw*0.10:y=ih*0.12:w=16:h=140:color=${a}:t=fill`);
      filters.push(`drawbox=x=iw*0.10:y=ih*0.12+164:w=iw*0.80:h=140:color=white@0.14:t=fill`);
      filters.push(`drawbox=x=iw*0.10:y=ih*0.12+164:w=16:h=140:color=${a}:t=fill`);
      break;
    case "lane":
      filters.push(`drawbox=x=iw*0.08:y=ih*0.14:w=iw*0.84:h=26:color=${a}@0.40:t=fill`);
      filters.push(`drawbox=x=iw*0.08:y=ih*0.14+54:w=iw*0.84:h=170:color=white@0.08:t=fill`);
      filters.push(`drawbox=x=iw*0.08:y=ih*0.14+54:w=iw*0.34:h=170:color=${a}@0.30:t=fill`);
      break;
    case "pulse":
      filters.push(`drawbox=x=iw*0.20:y=ih*0.10:w=iw*0.60:h=iw*0.38:color=${a}@0.16:t=fill`);
      filters.push(`drawbox=x=iw*0.28:y=ih*0.14:w=iw*0.44:h=iw*0.30:color=${a}@0.28:t=18`);
      break;
    case "frame":
      filters.push(`drawbox=x=48:y=140:w=iw-96:h=ih*0.30:color=${a}:t=16`);
      filters.push(`drawbox=x=iw*0.18:y=ih*0.36:w=iw*0.64:h=18:color=${a}:t=fill`);
      break;
    default:
      break;
  }

  return filters;
}

function pipFilters(scene: VisualScene, total: number): string[] {
  const filters: string[] = [];
  const count = Math.min(total, 12);
  for (let i = 0; i < count; i += 1) {
    const color = i === scene.index % count ? scene.accent : "white@0.22";
    filters.push(
      `drawbox=x=80+${i}*36:y=ih*0.445:w=22:h=10:color=${color}:t=fill`,
    );
  }
  return filters;
}

function punchCrop(scene: VisualScene, width: number, height: number, duration: number): string {
  const d = Math.max(duration, 0.2).toFixed(3);
  const scale = `scale=w='iw*(1+0.10*t/${d})':h='ih*(1+0.10*t/${d})':eval=frame`;
  let x = `(in_w-${width})/2`;
  let y = `(in_h-${height})/2`;
  if (scene.punch === "left") {
    x = `(in_w-${width})*(1-0.15*t/${d})`;
  } else if (scene.punch === "right") {
    x = `(in_w-${width})*(0.15+0.85*t/${d})`;
  } else if (scene.punch === "up") {
    y = `(in_h-${height})*(1-0.20*t/${d})`;
  }
  return `${scale},crop=${width}:${height}:${x}:${y}`;
}

async function renderSceneClip(
  scene: VisualScene,
  width: number,
  height: number,
  outPath: string,
): Promise<void> {
  const duration = Math.max(scene.end - scene.start, 0.2);
  const overW = Math.round(width * 1.14);
  const overH = Math.round(height * 1.14);
  const lavfi = `gradients=s=${overW}x${overH}:d=${duration.toFixed(3)}:r=30:c0=${scene.bg0}:c1=${scene.bg1}:n=2:type=${scene.gradient}:speed=0.035`;
  const vf = [
    ...motifFilters(scene),
    ...pipFilters(scene, 10),
    punchCrop(scene, width, height, duration),
    "format=yuv420p",
  ].join(",");

  await run("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    lavfi,
    "-vf",
    vf,
    "-t",
    duration.toFixed(3),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    outPath,
  ]);
}

export async function renderVideo(input: {
  script: Script;
  wavPath: string;
  mp4Path: string;
  assPath: string;
  scenesPath: string;
  aspect: AspectRatio;
  words: WordTiming[];
  scenes: VisualScene[];
}): Promise<{ duration: number }> {
  const duration = await probeDurationSeconds(input.wavPath);
  const font = resolveFont();
  const { width, height } = videoSize(input.aspect);

  await writeFile(
    input.assPath,
    buildKineticAss({
      script: input.script,
      words: input.words,
      scenes: input.scenes,
      duration,
      aspect: input.aspect,
      fontName: font.name,
    }),
  );
  await writeFile(input.scenesPath, JSON.stringify(input.scenes, null, 2) + "\n");

  const tmp = await mkdtemp(path.join(os.tmpdir(), "yt-factory-render-"));
  try {
    const clips: string[] = [];
    for (const scene of input.scenes) {
      const clip = path.join(tmp, `s${String(scene.index).padStart(2, "0")}.mp4`);
      await renderSceneClip(scene, width, height, clip);
      clips.push(clip);
    }

    const listPath = path.join(tmp, "concat.txt");
    await writeFile(
      listPath,
      clips.map((clip) => `file '${clip.replaceAll("'", "'\\''")}'`).join("\n") + "\n",
    );

    const concatPath = path.join(tmp, "bg.mp4");
    await run("ffmpeg", [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-c",
      "copy",
      concatPath,
    ]);

    const assFilter = `ass=${input.assPath.replaceAll("\\", "/").replaceAll(":", "\\:")}:fontsdir=${font.dir}`;
    await run("ffmpeg", [
      "-y",
      "-i",
      concatPath,
      "-i",
      input.wavPath,
      "-vf",
      assFilter,
      "-af",
      "loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "20",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-ac",
      "1",
      "-shortest",
      "-movflags",
      "+faststart",
      input.mp4Path,
    ]);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }

  return { duration };
}

export function artifactPaths(dir: string): ArtifactPaths {
  return {
    script: path.join(dir, "script.md"),
    audio: path.join(dir, "voice.wav"),
    video: path.join(dir, "video.mp4"),
    captions: path.join(dir, "captions.ass"),
    scenes: path.join(dir, "scenes.json"),
  };
}
