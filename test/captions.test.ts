import assert from "node:assert/strict";
import { test } from "node:test";
import { buildKineticAss } from "../src/captions.ts";
import { generateScript } from "../src/script.ts";
import { estimateWordTimings, planScenes } from "../src/timing.ts";

test("kinetic captions put the hook on screen at 0 and highlight words", () => {
  const script = generateScript("What an emergency fund actually is");
  const duration = 36;
  const words = estimateWordTimings(
    [script.hook, ...script.beats, script.cta].join(" "),
    duration,
  );
  const scenes = planScenes(script, duration, words);
  const ass = buildKineticAss({
    script,
    words,
    scenes,
    duration,
    aspect: "9:16",
    fontName: "Inter",
  });

  assert.match(ass, /^Dialogue: 1,0:00:00\.00,/m);
  assert.match(ass, /This is not leftover cash/);
  assert.match(ass, /\\c&H/i);
  assert.match(ass, /Style: Hook,/);
  assert.ok((ass.match(/^Dialogue:/gm) ?? []).length > scenes.length);
});
