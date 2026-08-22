import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { generateScript, writeScriptMarkdown } from "./script.ts";
import { slugify } from "./slug.ts";
import { narrationText, synthesizeVoice } from "./tts.ts";
import type { ProduceOptions } from "./types.ts";
import { artifactPaths, renderVideo } from "./video.ts";

export async function produce(options: ProduceOptions) {
  const topic = options.topic.trim();
  const aspect = options.aspect ?? "9:16";
  const script = generateScript(topic);
  const root = path.resolve(options.outDir ?? "output");
  const dest = path.join(root, slugify(script.topic));
  await mkdir(dest, { recursive: true });

  const files = artifactPaths(dest);
  await writeFile(files.script, writeScriptMarkdown(script), "utf8");

  const engine = await synthesizeVoice(
    narrationText(script.hook, script.beats, script.cta),
    files.audio,
  );
  const { duration } = await renderVideo({
    script,
    wavPath: files.audio,
    mp4Path: files.video,
    assPath: files.captions,
    aspect,
  });

  return { script, dest, files, engine, aspect, duration };
}
