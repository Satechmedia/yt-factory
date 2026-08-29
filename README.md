# yt-factory

One command turns a money topic into a finished short: an original script, a spoken voice track, and a captioned video.

Niche: **plain-English money explainers**. Not trading signals. Not scraped from other channels. This slice does not upload to YouTube, talk to OAuth, or schedule posts.

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

`npm test` covers script structure (hook + 5–8 beats + CTA) and the short word-cap guard. `npm run sample` writes the sample artifacts below.

## Output

For the sample topic, look in:

```
output/what-an-emergency-fund-actually-is/script.md
output/what-an-emergency-fund-actually-is/voice.wav
output/what-an-emergency-fund-actually-is/video.mp4
```

The video is a generated navy field with big captions. No third-party footage.

## How it works

1. **Script** — original explainer copy (curated for a few core topics, composed for anything else). Always a hook, 5–8 beats, and a CTA, capped at 150 spoken words.
2. **Voice** — `espeak-ng` when installed (local/open TTS). If it is missing, a clearly mocked formant voice track is written instead. No API key is required.
3. **Video** — `ffmpeg` burns timed captions onto a 9:16 or 16:9 solid background.

On Debian/Ubuntu, local TTS is:

```bash
sudo apt-get install -y espeak-ng
```

`ffmpeg` and `ffprobe` must be on `PATH`.

Standalone Robinhood Chain token watcher (education/research, not this YouTube pipeline): see [rh-watch/](rh-watch/).
