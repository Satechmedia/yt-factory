#!/usr/bin/env python3
"""Synthesize narration with Microsoft Edge online neural voices.

This is a local CLI wrapper. Audio and word timings come from Microsoft's
speech service, so a network connection is required.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys


async def synthesize(text: str, voice: str, rate: str, media: str, words_path: str) -> None:
    import edge_tts

    communicate = edge_tts.Communicate(
        text,
        voice,
        rate=rate,
        boundary="WordBoundary",
    )
    audio = bytearray()
    words: list[dict[str, float | str]] = []

    async for chunk in communicate.stream():
        kind = chunk.get("type")
        if kind == "audio":
            audio.extend(chunk["data"])
        elif kind == "WordBoundary":
            start = float(chunk["offset"]) / 10_000_000
            dur = float(chunk["duration"]) / 10_000_000
            words.append(
                {
                    "text": str(chunk["text"]),
                    "start": start,
                    "end": start + dur,
                }
            )

    if not audio:
        raise SystemExit("edge-tts returned no audio")

    with open(media, "wb") as fh:
        fh.write(audio)
    with open(words_path, "w", encoding="utf-8") as fh:
        json.dump(words, fh)


def main() -> None:
    parser = argparse.ArgumentParser(description="edge-tts wrapper for yt-factory")
    parser.add_argument("--voice", default="en-US-JennyNeural")
    parser.add_argument("--rate", default="+12%")
    parser.add_argument("--media", required=True)
    parser.add_argument("--words", required=True)
    args = parser.parse_args()
    text = sys.stdin.read().strip()
    if not text:
        raise SystemExit("no text on stdin")
    asyncio.run(synthesize(text, args.voice, args.rate, args.media, args.words))


if __name__ == "__main__":
    main()
