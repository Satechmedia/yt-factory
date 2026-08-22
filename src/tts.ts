import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { commandExists, run } from "./run.ts";
import type { TtsEngine, WordTiming } from "./types.ts";
import { estimateWordTimings, narrationText, scaleWordTimings } from "./timing.ts";
import { MAX_VIDEO_SECONDS, MIN_VIDEO_SECONDS } from "./validate.ts";

export type TtsResult = {
  engine: TtsEngine;
  duration: number;
  words: WordTiming[];
  network: boolean;
};

const ESPEAK_BIN = process.env.ESPEAK_BIN ?? "espeak-ng";
const PIPER_BIN = process.env.PIPER_BIN ?? "piper";
const PYTHON_BIN = process.env.PYTHON_BIN ?? "python3";
const EDGE_VOICE = process.env.EDGE_TTS_VOICE ?? "en-US-JennyNeural";
const EDGE_RATE = process.env.EDGE_TTS_RATE ?? "+12%";

const EDGE_HELPER = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "tools",
  "edge_tts_synth.py",
);

export { narrationText };

async function pythonHasEdgeTts(): Promise<boolean> {
  if (!commandExists(PYTHON_BIN)) {
    return false;
  }
  try {
    await run(PYTHON_BIN, ["-c", "import edge_tts"]);
    return true;
  } catch {
    return false;
  }
}

export async function resolveTtsEngine(): Promise<TtsEngine> {
  const forced = process.env.YT_FACTORY_TTS;
  if (forced === "edge-tts" || forced === "piper" || forced === "espeak-ng") {
    return forced;
  }
  if (await pythonHasEdgeTts()) {
    return "edge-tts";
  }
  if (commandExists(PIPER_BIN) && process.env.PIPER_MODEL) {
    return "piper";
  }
  if (commandExists(ESPEAK_BIN)) {
    return "espeak-ng";
  }
  throw new Error(
    "No real TTS found. Install edge-tts (`pip install edge-tts`, uses Microsoft online voices), piper (set PIPER_MODEL), or espeak-ng. There is no silent mock-TTS fallback.",
  );
}

async function probeDurationSeconds(mediaPath: string): Promise<number> {
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

async function ffmpegToWav(inputPath: string, wavPath: string, extraAf: string[] = []): Promise<void> {
  const af = ["silenceremove=start_periods=1:start_threshold=-40dB:start_duration=0.04", ...extraAf];
  await run("ffmpeg", [
    "-y",
    "-i",
    inputPath,
    "-ac",
    "1",
    "-ar",
    "24000",
    "-af",
    af.join(","),
    wavPath,
  ]);
}

function parseWordsFile(raw: string): WordTiming[] {
  const parsed = JSON.parse(raw) as Array<{ text: string; start: number; end: number }>;
  return parsed
    .filter((word) => word.text && Number.isFinite(word.start) && Number.isFinite(word.end))
    .map((word) => ({
      text: word.text.replace(/[^\w$'-]+/g, ""),
      start: word.start,
      end: word.end,
    }))
    .filter((word) => word.text.length > 0);
}

async function synthesizeEdge(text: string, wavPath: string): Promise<WordTiming[]> {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "yt-factory-edge-"));
  const media = path.join(tmp, "voice.mp3");
  const wordsFile = path.join(tmp, "words.json");
  try {
    await run(
      PYTHON_BIN,
      [
        EDGE_HELPER,
        "--voice",
        EDGE_VOICE,
        "--rate",
        EDGE_RATE,
        "--media",
        media,
        "--words",
        wordsFile,
      ],
      text,
    );
    await ffmpegToWav(media, wavPath);
    return parseWordsFile(await readFile(wordsFile, "utf8"));
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

async function synthesizePiper(text: string, wavPath: string): Promise<void> {
  const model = process.env.PIPER_MODEL;
  if (!model) {
    throw new Error("PIPER_MODEL is not set");
  }
  await run(PIPER_BIN, ["--model", model, "--output_file", wavPath], text);
}

async function synthesizeEspeak(text: string, wavPath: string): Promise<void> {
  await run(
    ESPEAK_BIN,
    ["-v", "en-us", "-s", "165", "-p", "42", "-w", wavPath, "--stdin"],
    text,
  );
}

async function fitDuration(
  wavPath: string,
  words: WordTiming[],
): Promise<{ duration: number; words: WordTiming[] }> {
  let duration = await probeDurationSeconds(wavPath);
  if (duration >= MIN_VIDEO_SECONDS && duration <= MAX_VIDEO_SECONDS) {
    return { duration, words };
  }

  const target = duration > MAX_VIDEO_SECONDS ? 42 : 32;
  const tempo = Math.min(2, Math.max(0.5, duration / target));
  const tmp = `${wavPath}.tempo.wav`;
  await run("ffmpeg", ["-y", "-i", wavPath, "-af", `atempo=${tempo.toFixed(3)}`, tmp]);
  await writeFile(wavPath, await readFile(tmp));
  await rm(tmp, { force: true });
  duration = await probeDurationSeconds(wavPath);
  return { duration, words: scaleWordTimings(words, tempo) };
}

export async function synthesizeVoice(text: string, wavPath: string): Promise<TtsResult> {
  const preferred = await resolveTtsEngine();
  const candidates: TtsEngine[] = ["edge-tts", "piper", "espeak-ng"];
  const order = [preferred, ...candidates.filter((engine) => engine !== preferred)];

  let lastError: unknown;
  for (const engine of order) {
    try {
      if (engine === "edge-tts") {
        if (!(await pythonHasEdgeTts())) {
          continue;
        }
        const words = await synthesizeEdge(text, wavPath);
        const fitted = await fitDuration(
          wavPath,
          words.length > 0 ? words : estimateWordTimings(text, await probeDurationSeconds(wavPath)),
        );
        return { engine, network: true, ...fitted };
      }
      if (engine === "piper") {
        if (!commandExists(PIPER_BIN) || !process.env.PIPER_MODEL) {
          continue;
        }
        await synthesizePiper(text, wavPath);
        const duration = await probeDurationSeconds(wavPath);
        const fitted = await fitDuration(wavPath, estimateWordTimings(text, duration));
        return { engine, network: false, ...fitted };
      }
      if (engine === "espeak-ng") {
        if (!commandExists(ESPEAK_BIN)) {
          continue;
        }
        await synthesizeEspeak(text, wavPath);
        const duration = await probeDurationSeconds(wavPath);
        const fitted = await fitDuration(wavPath, estimateWordTimings(text, duration));
        return { engine, network: false, ...fitted };
      }
    } catch (error) {
      lastError = error;
    }
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError ?? "");
  throw new Error(
    `Real TTS failed. Install edge-tts, piper, or espeak-ng. Last error: ${detail}`.trim(),
  );
}
