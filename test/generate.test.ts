import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { produce } from "../src/pipeline.ts";
import { MAX_SHOT_SECONDS } from "../src/timing.ts";
import { MAX_VIDEO_SECONDS, MIN_VIDEO_SECONDS, SHORT_WORD_CAP } from "../src/validate.ts";
import { probeDurationSeconds, probeMeanVolumeDb } from "../src/video.ts";
import { countWords, spokenText } from "../src/words.ts";

const SAMPLE_TOPIC = "What an emergency fund actually is";

function section(markdown: string, heading: string): string {
  const pattern = new RegExp(
    `^## ${heading}\\s+([\\s\\S]*?)(?=^## |\\s*$)`,
    "m",
  );
  const match = markdown.match(pattern);
  assert.ok(match, `script.md is missing a ## ${heading} section`);
  return match[1].trim();
}

test(
  "generate sample topic writes hook, CTA, word-capped script, and a watchable mp4",
  { timeout: 180_000 },
  async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), "yt-factory-"));
    const result = await produce({ topic: SAMPLE_TOPIC, outDir });

    const scriptMd = await readFile(result.files.script, "utf8");
    const hook = section(scriptMd, "Hook");
    const cta = section(scriptMd, "CTA");
    const beats = section(scriptMd, "Beats");

    assert.ok(hook.length > 0, "generated script.md has an empty hook");
    assert.ok(cta.length > 0, "generated script.md has an empty CTA");
    assert.ok(beats.length > 0, "generated script.md has empty beats");
    assert.equal(result.script.hook.trim(), hook);
    assert.equal(result.script.cta.trim(), cta);

    const words = countWords(
      spokenText(result.script.hook, result.script.beats, result.script.cta),
    );
    assert.ok(
      words <= SHORT_WORD_CAP,
      `generate path allowed ${words} spoken words (cap ${SHORT_WORD_CAP})`,
    );
    assert.equal(SHORT_WORD_CAP, 150, "word-cap must be the claimed 150");

    const video = await stat(result.files.video);
    assert.ok(video.isFile(), "generate did not write video.mp4");
    assert.ok(video.size > 0, "generated video.mp4 is empty");
    assert.equal(path.basename(result.files.video), "video.mp4");

    const probed = await probeDurationSeconds(result.files.video);
    assert.ok(
      probed >= MIN_VIDEO_SECONDS && probed <= MAX_VIDEO_SECONDS,
      `mp4 duration ${probed.toFixed(2)}s is outside ${MIN_VIDEO_SECONDS}-${MAX_VIDEO_SECONDS}s`,
    );
    assert.ok(
      result.duration >= MIN_VIDEO_SECONDS && result.duration <= MAX_VIDEO_SECONDS,
      `pipeline duration ${result.duration.toFixed(2)}s is outside ${MIN_VIDEO_SECONDS}-${MAX_VIDEO_SECONDS}s`,
    );

    assert.ok(result.scenes.length >= 4, `expected 4+ scenes, got ${result.scenes.length}`);
    assert.equal(result.scenes[0].start, 0, "first scene must start at 0 for the hook");
    for (const scene of result.scenes) {
      const shot = scene.end - scene.start;
      assert.ok(
        shot <= MAX_SHOT_SECONDS + 0.08,
        `scene ${scene.index} is ${shot.toFixed(2)}s (max ${MAX_SHOT_SECONDS}s)`,
      );
    }

    const meanDb = await probeMeanVolumeDb(result.files.video);
    assert.ok(
      meanDb > -35,
      `video audio looks silent (mean_volume ${meanDb} dB); sample must have audible speech`,
    );

    const captions = await readFile(result.files.captions, "utf8");
    assert.match(captions, /Style: Hook,/);
    assert.match(captions, /This is not leftover cash/i);
    assert.match(captions, /^Dialogue: \d+,0:00:00\.00,/m);
    assert.match(captions, /\\c&H/i);
    assert.equal(result.engine === "edge-tts" || result.engine === "espeak-ng" || result.engine === "piper", true);
  },
);
