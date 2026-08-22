# yt-factory

One command turns a money topic into a finished short: an original spoken script, a real voice track, and a captioned video with cuts.

Niche: **plain-English money explainers**. Not trading signals. Not scraped from other channels. This slice does not upload to YouTube, talk to OAuth, build thumbnails, or open a dashboard.

## Commands

```bash
npm install
npm test
npm run sample
```

Or pass any topic:

```bash
npm run make -- --topic "What an emergency fund actually is"
```

Optional flags: `--aspect 9:16|16:9` (default `9:16`) and `--out output`.

`npm test` covers script structure (hook + 5–8 beats + CTA), the 150-word cap, sample duration (30–45s), and more than one visual scene. `npm run sample` writes the sample artifacts below.

## Output

For the sample topic, look in:

```
output/what-an-emergency-fund-actually-is/script.md
output/what-an-emergency-fund-actually-is/voice.wav
output/what-an-emergency-fund-actually-is/video.mp4
output/what-an-emergency-fund-actually-is/captions.ass
output/what-an-emergency-fund-actually-is/scenes.json
```

The video is original generated graphics only: shifting gradients, shapes, punch-ins, and kinetic captions. No yt-dlp, no stock footage, no other YouTube clips.

## Voice / TTS

The pipeline uses a **real TTS**. There is no silent mock-TTS fallback.

Preference order:

1. **edge-tts** if the Python package is installed. This is a local CLI that calls **Microsoft online neural voices**. It needs a network connection. Default voice: `en-US-JennyNeural`.
2. **piper** if `piper` is on `PATH` and `PIPER_MODEL` points at an onnx model (fully local).
3. **espeak-ng** if installed (fully local).

Install options:

```bash
# Best watchable voice (network):
python3 -m pip install --user edge-tts

# Fully local fallback:
sudo apt-get install -y espeak-ng
```

Force an engine with `YT_FACTORY_TTS=edge-tts|piper|espeak-ng`. Optional: `EDGE_TTS_VOICE`, `EDGE_TTS_RATE` (default `+12%`).

`ffmpeg` and `ffprobe` must be on `PATH`.

## How it works

1. **Script** — original explainer copy written to be spoken, not a blog. Always a hook, 5–8 beats, and a CTA, capped at 150 spoken words. The sample hook is on screen and in voice in the first two seconds.
2. **Voice** — real TTS (see above). Word timings drive captions.
3. **Video** — ffmpeg cuts original graphic scenes at least every 3–4 seconds (4+ background shifts), with punch-ins and word/line highlights.

Sample target length is **30–45 seconds**.
