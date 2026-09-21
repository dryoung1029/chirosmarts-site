#!/usr/bin/env python3
"""
Mechanical tic report for the voice-profile skill.

Deterministic, script-based checks that complement (not replace) the
qualitative voice-profile review the skill does by reading. Counts recurring
verbal tics and — the one the owner specifically wants tracked — lists every
sentence-initial "so" with enough context to edit or cut it directly.

Benchmarks in the comments are from ~82,500 words of Dr. Young's real
unscripted course narration (18 recordings, 3 ChiroSmarts courses). A single
new script will naturally read "noisier" than that full-corpus rate on any one
tic — that's expected on a small sample, not necessarily a problem.

Usage:
    python3 tic_report.py <file1.md> [file2.md ...]
"""
import re
import signal
import sys

# Exit quietly instead of stack-tracing when output is piped into something
# that closes early (e.g. `| head`). SIGPIPE doesn't exist on Windows.
if hasattr(signal, "SIGPIPE"):
    signal.signal(signal.SIGPIPE, signal.SIG_DFL)

# label -> regex (case-insensitive)
TICS = [
    ("kind of / sort of",           r"\b(kind of|sort of)\b"),
    ("you know",                    r"\byou know\b"),
    ("actually",                    r"\bactually\b"),
    ("...and everything/things/anything like that", r"\band (everything|things|anything) like that\b"),
    ("for example",                 r"\bfor example\b"),
    ("right? (tag question)",       r"\bright\?"),
    ("well, (opener)",              r"\bwell,"),
    ("I guess / I don't know",      r"\b(I guess|I don't know)\b"),
]

# Corpus benchmark rate for sentence-initial "so": ~1 per 150 words.
SO_BENCHMARK_WORDS_PER_HIT = 150


def strip_markup(text):
    """Drop markdown headers, rules, and code-fence/backtick metadata lines."""
    lines = []
    for line in text.splitlines():
        s = line.strip()
        if not s:
            continue
        if s.startswith("#") or s.startswith("---") or s.startswith("`"):
            continue
        lines.append(line)
    return " ".join(lines)


def split_sentences(text):
    """Naive split on sentence-ending punctuation. Good enough for a tic scan,
    not a grammar tool — a script with unusual punctuation will split oddly."""
    parts = re.split(r"(?<=[.!?])\s+", text)
    return [p.strip() for p in parts if len(p.split()) > 2]


def main():
    if len(sys.argv) < 2:
        print("usage: tic_report.py <file1.md> [file2.md ...]")
        sys.exit(1)

    raw = ""
    for path in sys.argv[1:]:
        with open(path, encoding="utf-8") as f:
            raw += strip_markup(f.read()) + " "

    word_count = len(raw.split())
    sentences = split_sentences(raw)
    sent_count = len(sentences)
    avg_len = word_count / sent_count if sent_count else 0

    print(f"Words: {word_count:,}")
    print(f"Sentences (approx): {sent_count:,}")
    print(f"Avg words/sentence: {avg_len:.1f}  (his live-teaching median is ~12; a script")
    print("  reads best in his punchier 8-15 word range, not his long-tail live rambling)")
    print()

    print("Tic frequency:")
    for label, pattern in TICS:
        n = len(re.findall(pattern, raw, flags=re.IGNORECASE))
        rate = f"  (1 per {word_count // n} words)" if n else ""
        print(f"  {label:48s} {n:4d}{rate}")

    so_sentences = [s for s in sentences if re.match(r"^so\b", s, flags=re.IGNORECASE)]
    n_so = len(so_sentences)
    rate = f"1 per {word_count // n_so} words" if n_so else "n/a"
    print(f"\n  Sentence-initial 'so'{'':27s} {n_so:4d}  ({rate})")
    print(f"  Benchmark (real unscripted talk): ~1 per {SO_BENCHMARK_WORDS_PER_HIT} words.")
    if n_so and word_count // n_so < SO_BENCHMARK_WORDS_PER_HIT:
        print("  -> Running hotter than his natural live rate. In a script, that reads as a")
        print("     tic rather than a voice — see 'Cut \"so\" on sight' in spoken-voice.md.")

    if so_sentences:
        print("\nEvery sentence-initial 'so' (cut it, or swap the connector):")
        for i, s in enumerate(so_sentences, 1):
            preview = s if len(s) <= 160 else s[:157] + "..."
            print(f"  {i:3d}. {preview}")


if __name__ == "__main__":
    main()
