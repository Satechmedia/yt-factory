import { parseArgs } from "node:util";
import { produce } from "./pipeline.ts";
import type { AspectRatio } from "./types.ts";

function printHelp(): void {
  console.log(`yt-factory — topic to a captioned short

Usage:
  npm run make -- --topic "What an emergency fund actually is"
  npm run sample

Options:
  --topic, -t    Money-explainer topic (required unless using npm run sample)
  --out, -o      Output root folder (default: output)
  --aspect, -a   9:16 (default, YouTube Short) or 16:9
  --help, -h     Show this help

TTS:
  Prefers edge-tts (Microsoft online neural voices; needs network),
  then piper if PIPER_MODEL is set, then local espeak-ng.
  There is no silent mock-TTS fallback.
`);
}

const { values } = parseArgs({
  options: {
    topic: { type: "string", short: "t" },
    out: { type: "string", short: "o", default: "output" },
    aspect: { type: "string", short: "a", default: "9:16" },
    help: { type: "boolean", short: "h", default: false },
  },
});

if (values.help) {
  printHelp();
  process.exit(0);
}

const topic = values.topic?.trim();
if (!topic) {
  printHelp();
  console.error("Error: --topic is required.");
  process.exit(1);
}

const aspect = values.aspect;
if (aspect !== "9:16" && aspect !== "16:9") {
  console.error('Error: --aspect must be "9:16" or "16:9".');
  process.exit(1);
}

const result = await produce({
  topic,
  outDir: values.out,
  aspect: aspect as AspectRatio,
});

const ttsNote = result.networkTts
  ? `${result.engine} (Microsoft online neural voices)`
  : `${result.engine} (local)`;

console.log(`Script:  ${result.files.script}`);
console.log(`Audio:   ${result.files.audio}  (${ttsNote})`);
console.log(`Video:   ${result.files.video}  ${result.aspect}  ${result.duration.toFixed(1)}s`);
console.log(`Scenes:  ${result.scenes.length} visual beats`);
