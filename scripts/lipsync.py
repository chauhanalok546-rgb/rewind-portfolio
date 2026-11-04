"""Turns word timings into mouth-shape (viseme) cues so the avatar's lips follow the actual words, not just the loudness.
Spelling -> Oculus visemes by simple English rules (good enough for a stylised mouth: it is the timing and the lip-closing sounds that matter)."""
import re

VOW = {"a": "aa", "e": "E", "i": "I", "o": "O", "u": "U"}
DIGRAPHS = [("tch", "CH"), ("sh", "CH"), ("ch", "CH"), ("th", "TH"), ("ph", "FF"), ("wh", "U"), ("ck", "kk"), ("ng", "nn"), ("qu", "kk"),
            ("ee", "I"), ("ea", "I"), ("oo", "U"), ("ou", "aa"), ("ow", "O"), ("oa", "O"), ("ai", "E"), ("ay", "E"), ("ie", "I"), ("oi", "O"), ("au", "aa"), ("aw", "aa")]
CONS = {"p": "PP", "b": "PP", "m": "PP", "f": "FF", "v": "FF", "t": "DD", "d": "DD", "n": "nn", "l": "nn", "k": "kk", "g": "kk", "c": "kk", "q": "kk", "x": "kk",
        "s": "SS", "z": "SS", "j": "CH", "r": "RR", "w": "U", "y": "I"}
NUM = {"0": "zero", "1": "one", "2": "two", "3": "three", "4": "four", "5": "five", "6": "six", "7": "seven", "8": "eight", "9": "nine"}

def word_visemes(word):
    w = re.sub(r"[^a-z0-9]", "", word.lower())
    w = "".join(NUM.get(c, c) + " " if c.isdigit() else c for c in w).replace(" ", "")
    if len(w) > 2 and w.endswith("e") and w[-2] not in "aeiou": w = w[:-1]          # silent final e
    out, i = [], 0
    while i < len(w):
        for dg, v in DIGRAPHS:
            if w.startswith(dg, i): out.append((v, 2.0 if v in ("I", "U", "O", "aa", "E") else 1.2)); i += len(dg); break
        else:
            c = w[i]
            if c in VOW: out.append((VOW[c], 2.0))
            elif c in CONS: out.append((CONS[c], 1.0))
            i += 1                                                                   # h and anything else: no mouth shape of its own
    # merge neighbours that share a shape
    merged = []
    for v, wt in out:
        if merged and merged[-1][0] == v: merged[-1] = (v, merged[-1][1] + wt)
        else: merged.append((v, wt))
    return merged or [("sil", 1.0)]

def words_to_cues(words, shift=0.0, total=None):
    """words: [(text, start_seconds, duration_seconds)] on the raw audio timeline; shift moves them onto the final (trimmed) audio."""
    cues = []
    for text, start, dur in words:
        vs = word_visemes(text)
        tw = sum(w for _, w in vs); t = start + shift
        dur = max(dur, 0.06)
        for v, wt in vs:
            d = dur * wt / tw
            if v != "sil": cues.append({"t": round(max(0, t), 3), "d": round(d, 3), "v": "viseme_" + v})
            t += d
    if total: cues = [c for c in cues if c["t"] < total]
    return cues

def chars_to_words(chars, starts, ends):
    """ElevenLabs character alignment -> [(word, start, duration)]"""
    words, cur, s0, e0 = [], "", None, None
    for ch, a, b in zip(chars, starts, ends):
        if ch.strip() == "" or ch in ",.;:!?—":
            if cur: words.append((cur, s0, e0 - s0)); cur, s0 = "", None
            continue
        if s0 is None: s0 = a
        cur += ch; e0 = b
    if cur: words.append((cur, s0, e0 - s0))
    return words
