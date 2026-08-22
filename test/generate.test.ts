import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { produce } from "../src/pipeline.ts";
import { SHORT_WORD_CAP } from "../src/validate.ts";
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
  "generate sample topic writes hook, CTA, word-capped script, and mp4",
  { timeout: 180_000 },
  async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), "yt-factory-"));
    const previousMock = process.env.FORCE_MOCK_TTS;
    process.env.FORCE_MOCK_TTS = "1";

    try {
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
    } finally {
      if (previousMock === undefined) {
        delete process.env.FORCE_MOCK_TTS;
      } else {
        process.env.FORCE_MOCK_TTS = previousMock;
      }
    }
  },
);
