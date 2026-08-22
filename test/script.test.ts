import assert from "node:assert/strict";
import { test } from "node:test";
import { generateScript, writeScriptMarkdown } from "../src/script.ts";
import { SHORT_WORD_CAP, validateScript } from "../src/validate.ts";
import { countWords, spokenText } from "../src/words.ts";

test("emergency fund script has a hook, 5-8 beats, and a CTA", () => {
  const script = generateScript("What an emergency fund actually is");
  const errors = validateScript(script);

  assert.deepEqual(errors, []);
  assert.ok(script.hook.length > 0, "hook should be present");
  assert.ok(script.cta.length > 0, "CTA should be present");
  assert.ok(script.beats.length >= 5 && script.beats.length <= 8);
  assert.match(script.hook, /not leftover cash/i);
  assert.ok(
    countWords(script.hook) <= 8,
    "hook must be short enough to land in the first two seconds",
  );
  assert.match(writeScriptMarkdown(script), /^# What an emergency fund actually is/m);
  assert.match(writeScriptMarkdown(script), /^## Hook/m);
  assert.match(writeScriptMarkdown(script), /^## CTA/m);
});

test("emergency fund short stays under the word cap", () => {
  const script = generateScript("What an emergency fund actually is");
  const words = countWords(spokenText(script.hook, script.beats, script.cta));
  assert.ok(words <= SHORT_WORD_CAP, `${words} words exceeds ${SHORT_WORD_CAP}`);
});

test("unknown money topic still returns a structured original explainer", () => {
  const script = generateScript("What a cash buffer is for rent week");
  const errors = validateScript(script);

  assert.deepEqual(errors, []);
  assert.match(script.hook, /cash buffer/i);
  assert.ok(script.cta.length > 0);
  assert.ok(script.beats.length >= 5 && script.beats.length <= 8);
  assert.ok(
    script.beats.some((beat) => /not a trading signal/i.test(beat)),
    "generic explainers must refuse trading-signal framing",
  );
});

test("empty topic is rejected", () => {
  assert.throws(() => generateScript("   "), /topic is required/i);
});
