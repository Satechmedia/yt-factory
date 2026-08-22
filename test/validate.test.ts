import assert from "node:assert/strict";
import { test } from "node:test";
import type { Script } from "../src/types.ts";
import {
  MAX_BEATS,
  MIN_BEATS,
  SHORT_WORD_CAP,
  validateScript,
} from "../src/validate.ts";

function script(overrides: Partial<Script> = {}): Script {
  return {
    topic: "Test topic",
    hook: "A short hook.",
    beats: [
      "Beat one is here.",
      "Beat two is here.",
      "Beat three is here.",
      "Beat four is here.",
      "Beat five is here.",
    ],
    cta: "Save this and take one step.",
    ...overrides,
  };
}

test("validateScript requires a hook and a CTA", () => {
  assert.ok(validateScript(script({ hook: "" })).includes("hook is required"));
  assert.ok(validateScript(script({ cta: "" })).includes("cta is required"));
  assert.deepEqual(validateScript(script()), []);
});

test("validateScript enforces 5-8 beats", () => {
  const tooFew = script({ beats: ["one", "two", "three", "four"] });
  const tooMany = script({
    beats: Array.from({ length: MAX_BEATS + 1 }, (_, i) => `Beat ${i + 1}.`),
  });

  assert.ok(
    validateScript(tooFew).some((e) => e.includes(`${MIN_BEATS}-${MAX_BEATS}`)),
  );
  assert.ok(
    validateScript(tooMany).some((e) => e.includes(`${MIN_BEATS}-${MAX_BEATS}`)),
  );
});

test("word-cap guard rejects an oversized short", () => {
  const bloated = script({
    hook: Array.from({ length: SHORT_WORD_CAP + 5 }, () => "word").join(" "),
  });
  const errors = validateScript(bloated);
  assert.ok(
    errors.some((error) => error.includes(`word cap ${SHORT_WORD_CAP}`)),
    errors.join("; "),
  );
});
