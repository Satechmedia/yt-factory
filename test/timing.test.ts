import assert from "node:assert/strict";
import { test } from "node:test";
import { generateScript } from "../src/script.ts";
import {
  MAX_SHOT_SECONDS,
  estimateWordTimings,
  planScenes,
  splitSpan,
} from "../src/timing.ts";

test("splitSpan cuts long beats so no shot sits past 4 seconds", () => {
  const spans = splitSpan(0, 9.2, MAX_SHOT_SECONDS);
  assert.ok(spans.length >= 3);
  for (const [start, end] of spans) {
    assert.ok(end - start <= MAX_SHOT_SECONDS + 0.001);
  }
});

test("sample script plans at least four visual scenes on a 36s track", () => {
  const script = generateScript("What an emergency fund actually is");
  const words = estimateWordTimings(
    [script.hook, ...script.beats, script.cta].join(" "),
    36,
  );
  const scenes = planScenes(script, 36, words);
  assert.ok(scenes.length >= 4);
  assert.equal(scenes[0].start, 0);
  assert.equal(scenes[0].part, "hook");
  assert.ok(scenes[scenes.length - 1].end === 36);
  assert.ok(new Set(scenes.map((scene) => scene.bg0)).size >= 4);
});
