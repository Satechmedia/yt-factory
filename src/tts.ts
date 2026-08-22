import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const ESPEAK_BIN = process.env.ESPEAK_BIN ?? "espeak-ng";

export type TtsEngine = "espeak-ng" | "mock";

function commandExists(bin: string): boolean {
  if (bin.includes("/")) {
    return existsSync(bin);
  }
  const path = process.env.PATH ?? "";
  return path.split(":").some((dir) => existsSync(`${dir}/${bin}`));
}

export function resolveTtsEngine(): TtsEngine {
  if (process.env.FORCE_MOCK_TTS === "1") {
    return "mock";
  }
  // Local/open TTS when present. No cloud key is required.
  // If someone later sets a TTS key, this slice still stays local.
  if (commandExists(ESPEAK_BIN)) {
    return "espeak-ng";
  }
  return "mock";
}

function run(bin: string, args: string[], stdin: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["pipe", "ignore", "pipe"] });
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
    child.stdin.end(stdin);
  });
}

/**
 * Tiny formant-ish synthesizer so a machine without espeak-ng still
 * gets a spoken-length voice track. Clearly a mock, not a product voice.
 */
function synthesizeMockWav(text: string): Buffer {
  const sampleRate = 22050;
  const formants: Record<string, [number, number, number]> = {
    a: [730, 1090, 2440],
    e: [530, 1840, 2480],
    i: [270, 2290, 3010],
    o: [570, 840, 2410],
    u: [300, 870, 2240],
    y: [300, 1870, 2800],
  };

  const samples: number[] = [];
  let phase = 0;
  let f1z1 = 0;
  let f1z2 = 0;
  let f2z1 = 0;
  let f2z2 = 0;

  const pushSilence = (seconds: number) => {
    const n = Math.floor(seconds * sampleRate);
    for (let i = 0; i < n; i += 1) {
      samples.push(0);
    }
  };

  const resonate = (
    input: number,
    freq: number,
    z1: number,
    z2: number,
  ): { out: number; z1: number; z2: number } => {
    const r = 0.92;
    const theta = (2 * Math.PI * freq) / sampleRate;
    const a1 = -2 * r * Math.cos(theta);
    const a2 = r * r;
    const out = input - a1 * z1 - a2 * z2;
    return { out, z1: out, z2: z1 };
  };

  const words = text.split(/\s+/).filter(Boolean);
  for (const word of words) {
    const letters = word.replace(/[^a-zA-Z]/g, "");
    const vowel = (letters.toLowerCase().match(/[aeiouy]/) ?? ["a"])[0];
    const [f1, f2] = formants[vowel] ?? formants.a;
    const duration = 0.16 + Math.min(letters.length, 12) * 0.038;
    const frames = Math.floor(duration * sampleRate);
    const f0 = 118 + (letters.length % 5) * 3;

    for (let i = 0; i < frames; i += 1) {
      const t = i / frames;
      const env = Math.min(t / 0.08, 1) * Math.min((1 - t) / 0.12, 1);
      phase += (2 * Math.PI * f0) / sampleRate;
      const glottal = phase % (2 * Math.PI) < 0.3 ? 0.7 : 0.02;
      const r1 = resonate(glottal, f1, f1z1, f1z2);
      f1z1 = r1.z1;
      f1z2 = r1.z2;
      const r2 = resonate(r1.out, f2, f2z1, f2z2);
      f2z1 = r2.z1;
      f2z2 = r2.z2;
      samples.push(Math.max(-1, Math.min(1, r2.out * env * 0.18)));
    }

    const pause = /[.!?]$/.test(word) ? 0.28 : /[,;:]$/.test(word) ? 0.16 : 0.06;
    pushSilence(pause);
  }

  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i += 1) {
    buffer.writeInt16LE(Math.round(samples[i] * 32767), 44 + i * 2);
  }
  return buffer;
}

export async function synthesizeVoice(
  text: string,
  wavPath: string,
): Promise<TtsEngine> {
  const engine = resolveTtsEngine();
  if (engine === "espeak-ng") {
    await run(
      ESPEAK_BIN,
      ["-v", "en-us", "-s", "145", "-p", "38", "-w", wavPath, "--stdin"],
      text,
    );
    return engine;
  }

  await writeFile(wavPath, synthesizeMockWav(text));
  return engine;
}

export function narrationText(hook: string, beats: string[], cta: string): string {
  return [hook, ...beats, cta].join(". ");
}
