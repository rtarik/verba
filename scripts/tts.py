#!/usr/bin/env python3
"""
Generates narration and word-level timings for every text.

Reads content/build/tts-manifest.json (produced by `npm run content:build`), so
this script never tokenizes Spanish itself — the TypeScript tokenizer is the
single authority on what counts as a word, and this only has to agree with it.

Writes:
  public/audio/<id>.mp3        the narration
  content/audio/<id>.json      voice, rate, duration, starts[], bodyHash

Idempotent: skips any text whose sidecar already matches the current prose.
Usage:  python scripts/tts.py [--force] [--only <text-id>] [--voice <name>]
"""
from __future__ import annotations
import argparse, asyncio, json, sys
from pathlib import Path

try:
    import edge_tts
except ImportError:
    sys.exit("edge-tts is not installed.  python3 -m venv .venv && .venv/bin/pip install -r requirements.txt")

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "content" / "build" / "tts-manifest.json"
AUDIO_OUT = ROOT / "public" / "audio"
SIDECAR_OUT = ROOT / "content" / "audio"

DEFAULT_VOICE = "es-ES-ElviraNeural"
DEFAULT_RATE = "-15%"          # slowed for beginners; timings follow the slowed audio

TICKS_PER_SECOND = 10_000_000  # edge-tts reports offsets in 100-nanosecond ticks


async def synth(body: str, voice: str, rate: str):
    """Return (mp3 bytes, [{text,start,dur}]).

    boundary="WordBoundary" is essential — the default is SentenceBoundary,
    which yields no per-word timings and silently breaks karaoke highlighting.
    """
    comm = edge_tts.Communicate(body, voice, rate=rate, boundary="WordBoundary")
    audio = bytearray()
    events = []
    async for chunk in comm.stream():
        if chunk["type"] == "audio":
            audio.extend(chunk["data"])
        elif chunk["type"] == "WordBoundary":
            events.append({
                "text": chunk["text"],
                "start": chunk["offset"] / TICKS_PER_SECOND,
                "dur": chunk["duration"] / TICKS_PER_SECOND,
            })
    return bytes(audio), events


def report_drift(text_id: str, words: list[str], events: list[dict]) -> str:
    """Explain exactly where the spoken sequence stopped matching the written one."""
    lines = [
        f"{text_id}: {len(events)} spoken words for {len(words)} written words.",
        "  The 1:1 mapping broke, so timings cannot be trusted. Divergence:",
    ]
    for i in range(max(len(words), len(events))):
        w = words[i] if i < len(words) else "—"
        e = events[i]["text"] if i < len(events) else "—"
        if w.strip("¿¡.,;:…\"'()").lower() != e.lower():
            lo = max(0, i - 2)
            for k in range(lo, min(max(len(words), len(events)), i + 3)):
                ww = words[k] if k < len(words) else "—"
                ee = events[k]["text"] if k < len(events) else "—"
                mark = "  <-- here" if k == i else ""
                lines.append(f"    [{k:>3}] written={ww!r:<16} spoken={ee!r}{mark}")
            break
    lines.append("  Most often a numeral: write numbers as words (\"veinticinco\", not \"25\").")
    return "\n".join(lines)


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="regenerate even if audio is current")
    ap.add_argument("--only", help="a single text id")
    ap.add_argument("--voice", default=DEFAULT_VOICE)
    ap.add_argument("--rate", default=DEFAULT_RATE)
    args = ap.parse_args()

    if not MANIFEST.exists():
        sys.exit("No manifest. Run `npm run content:build` first.")

    manifest = json.loads(MANIFEST.read_text())
    if args.only:
        manifest = [m for m in manifest if m["id"] == args.only]
        if not manifest:
            sys.exit(f"No text with id {args.only!r}")

    AUDIO_OUT.mkdir(parents=True, exist_ok=True)
    SIDECAR_OUT.mkdir(parents=True, exist_ok=True)

    failures, made, skipped = [], 0, 0

    for entry in manifest:
        tid, words = entry["id"], entry["words"]
        sidecar = SIDECAR_OUT / f"{tid}.json"
        mp3 = AUDIO_OUT / f"{tid}.mp3"

        if not args.force and sidecar.exists() and mp3.exists():
            existing = json.loads(sidecar.read_text())
            if existing.get("bodyHash") == entry["bodyHash"] and existing.get("voice") == args.voice:
                skipped += 1
                continue

        print(f"  synthesizing {tid} ({len(words)} words) ...", flush=True)
        audio, events = await synth(entry["body"], args.voice, args.rate)

        if len(events) != len(words):
            failures.append(report_drift(tid, words, events))
            continue

        mp3.write_bytes(audio)
        starts = [round(e["start"], 3) for e in events]
        last = events[-1]
        sidecar.write_text(json.dumps({
            "id": tid,
            "voice": args.voice,
            "rate": args.rate,
            "duration": round(last["start"] + last["dur"], 3),
            "starts": starts,
            "bodyHash": entry["bodyHash"],
        }, indent=2, ensure_ascii=False))
        made += 1
        print(f"    -> {mp3.relative_to(ROOT)}  {len(audio)/1024:.0f} KB  {starts[-1]:.1f}s")

    print(f"\naudio: {made} generated, {skipped} already current, {len(failures)} failed")
    if failures:
        print("\n" + "\n\n".join(failures) + "\n")
        return 1
    print("Re-run `npm run content:build` to attach the new timings.\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
