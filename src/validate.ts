import type { Script } from "./types.ts";
import { countWords, spokenText } from "./words.ts";

/** Spoken-word ceiling for a YouTube short. Sample target is 30–45s. */
export const SHORT_WORD_CAP = 150;
export const MIN_BEATS = 5;
export const MAX_BEATS = 8;
export const MIN_VIDEO_SECONDS = 30;
export const MAX_VIDEO_SECONDS = 45;

export function validateScript(script: Script): string[] {
  const errors: string[] = [];

  if (!script.topic.trim()) {
    errors.push("topic is required");
  }
  if (!script.hook.trim()) {
    errors.push("hook is required");
  }
  if (!script.cta.trim()) {
    errors.push("cta is required");
  }
  if (script.beats.length < MIN_BEATS || script.beats.length > MAX_BEATS) {
    errors.push(
      `beats must be ${MIN_BEATS}-${MAX_BEATS} items, got ${script.beats.length}`,
    );
  }
  if (script.beats.some((beat) => !beat.trim())) {
    errors.push("every beat must be non-empty");
  }

  const words = countWords(spokenText(script.hook, script.beats, script.cta));
  if (words > SHORT_WORD_CAP) {
    errors.push(`word cap ${SHORT_WORD_CAP} exceeded (${words} words)`);
  }

  return errors;
}

export function assertValidScript(script: Script): void {
  const errors = validateScript(script);
  if (errors.length > 0) {
    throw new Error(`Invalid script: ${errors.join("; ")}`);
  }
}

export function durationInRange(seconds: number): boolean {
  return seconds >= MIN_VIDEO_SECONDS && seconds <= MAX_VIDEO_SECONDS;
}
