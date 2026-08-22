export function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

export function spokenText(hook: string, beats: string[], cta: string): string {
  return [hook, ...beats, cta].join(" ");
}
