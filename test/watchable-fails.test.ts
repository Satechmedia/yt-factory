import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { run } from "../src/run.ts";
import { MAX_SHOT_SECONDS } from "../src/timing.ts";
import { resolveTtsEngine } from "../src/tts.ts";
import type { TtsEngine, VisualScene } from "../src/types.ts";
import { MAX_VIDEO_SECONDS, MIN_VIDEO_SECONDS } from "../src/validate.ts";
import { probeDurationSeconds, probeMeanVolumeDb } from "../src/video.ts";

const SAMPLE_DIR = path.join(
  process.cwd(),
  "output",
  "what-an-emergency-fund-actually-is",
);
const SAMPLE_VIDEO = path.join(SAMPLE_DIR, "video.mp4");
const REAL_ENGINES: readonly TtsEngine[] = ["edge-tts", "piper", "espeak-ng"];

async function readSource(rel: string): Promise<string> {
  return readFile(path.join(process.cwd(), rel), "utf8");
}

async function sceneChangeTimes(videoPath: string, threshold = 0.08): Promise<number[]> {
  const { stderr } = await run("ffmpeg", [
    "-i",
    videoPath,
    "-filter:v",
    `select='gt(scene,${threshold})',showinfo`,
    "-f",
    "null",
    "-",
  ]);
  return [...stderr.matchAll(/pts_time:\s*(\d+(?:\.\d+)?)/g)].map((match) =>
    Number.parseFloat(match[1]),
  );
}

async function frameMeanRgb(videoPath: string, atSeconds: number): Promise<[number, number, number]> {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "yt-factory-frame-"));
  const jpg = path.join(tmp, "frame.jpg");
  const rgb = path.join(tmp, "frame.rgb");
  try {
    await run("ffmpeg", [
      "-y",
      "-ss",
      String(atSeconds),
      "-i",
      videoPath,
      "-frames:v",
      "1",
      jpg,
    ]);
    await run("ffmpeg", [
      "-y",
      "-i",
      jpg,
      "-vf",
      "scale=1:1",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      rgb,
    ]);
    const bytes = await readFile(rgb);
    assert.equal(bytes.length, 3, `expected 3 RGB bytes at ${atSeconds}s, got ${bytes.length}`);
    return [bytes[0], bytes[1], bytes[2]];
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

function rgbDistance(a: [number, number, number], b: [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

test("source has no mock TTS / formant fallback", async () => {
  const tts = await readSource("src/tts.ts");
  const types = await readSource("src/types.ts");
  const cli = await readSource("src/cli.ts");

  assert.doesNotMatch(tts, /synthesizeMock|formant|engine\s*[:=]\s*["']mock["']/i);
  assert.doesNotMatch(tts, /YT_FACTORY_TTS["']?\s*===\s*["']mock["']/);
  assert.doesNotMatch(cli, /\(mock\)/);
  assert.match(types, /TtsEngine = "edge-tts" \| "piper" \| "espeak-ng"/);
  assert.match(tts, /edge-tts/);
  assert.match(tts, /piper/);
  assert.match(tts, /espeak-ng/);
  assert.match(tts, /There is no silent mock-TTS fallback/);
  assert.match(cli, /There is no silent mock-TTS fallback/);
});

test("resolveTtsEngine returns a real engine, never mock", async () => {
  const engine = await resolveTtsEngine();
  assert.ok(
    (REAL_ENGINES as readonly string[]).includes(engine),
    `resolveTtsEngine returned ${engine}; expected edge-tts / piper / espeak-ng`,
  );
});

test("committed sample is not a frozen navy slide or long uncut take", async () => {
  const scenes = JSON.parse(await readFile(path.join(SAMPLE_DIR, "scenes.json"), "utf8")) as VisualScene[];
  const captions = await readFile(path.join(SAMPLE_DIR, "captions.ass"), "utf8");
  const script = await readFile(path.join(SAMPLE_DIR, "script.md"), "utf8");
  const duration = await probeDurationSeconds(SAMPLE_VIDEO);
  const meanDb = await probeMeanVolumeDb(SAMPLE_VIDEO);
  const cuts = await sceneChangeTimes(SAMPLE_VIDEO);
  const samples = [0, 2, 8, 15, 25, 35];
  const colors = await Promise.all(samples.map((t) => frameMeanRgb(SAMPLE_VIDEO, t)));

  assert.ok(
    duration >= MIN_VIDEO_SECONDS && duration <= MAX_VIDEO_SECONDS,
    `sample duration ${duration.toFixed(2)}s is outside ${MIN_VIDEO_SECONDS}-${MAX_VIDEO_SECONDS}s`,
  );
  assert.ok(duration <= 50, `sample duration ${duration.toFixed(2)}s is a long slide`);
  assert.ok(scenes.length >= 4, `expected 4+ visual beats, got ${scenes.length}`);
  assert.ok(new Set(scenes.map((scene) => scene.bg0)).size >= 4, "sample uses one background color");
  assert.ok(new Set(scenes.map((scene) => scene.motif)).size >= 4, "sample uses one motif");
  for (const scene of scenes) {
    const shot = scene.end - scene.start;
    assert.ok(
      shot <= MAX_SHOT_SECONDS + 0.08,
      `scene ${scene.index} is ${shot.toFixed(2)}s (max ${MAX_SHOT_SECONDS}s)`,
    );
  }
  assert.equal(scenes[0].part, "hook");
  assert.ok(scenes[0].end <= 2.1, `hook scene lasts ${scenes[0].end.toFixed(2)}s; hook should land in ~2s`);
  assert.match(script, /This is not leftover cash/);
  assert.match(captions, /Style: Hook,/);
  assert.match(captions, /^Dialogue: \d+,0:00:00\.00,0:00:0[2-9]/m);
  assert.match(captions, /This is not leftover cash/);
  assert.match(captions, /\\c&H/i);
  assert.ok(
    (captions.match(/^Dialogue:/gm) ?? []).length > scenes.length,
    "captions look like one card per scene, not kinetic word highlights",
  );
  assert.ok(meanDb > -35, `sample audio looks silent (mean_volume ${meanDb} dB)`);
  assert.ok(cuts.length >= 4, `ffprobe/ffmpeg scene detect found ${cuts.length} cuts; need 4+`);
  assert.ok(
    colors.some((color, index) => index > 0 && rgbDistance(color, colors[0]) > 25),
    `sampled frames look like the same navy slide: ${JSON.stringify(Object.fromEntries(samples.map((t, i) => [t, colors[i]])))}`,
  );
});
