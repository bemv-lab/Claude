"""Gera a trilha de boca (visemas por frame) e os tempos das palavras para a legenda.

Aceita três fontes de tempo, nesta ordem de qualidade:
  1. JSON de alinhamento do ElevenLabs (endpoint /with-timestamps: characters + start/end por caractere)
  2. JSON do eSpeak (voz de teste: fonemas + palavras com ms)
  3. Nenhum: só o volume do áudio (boca de fantoche) + palavras distribuídas na fala

Uso:
  python -I build_lipsync.py --audio voz.mp3 --text "roteiro..." --out src/data/fala.json \
      [--timing alinhamento.json] [--fps 30]
"""
import argparse
import json
import math
import os
import struct
import subprocess
import tempfile
import unicodedata
import wave

# Visemas compartilhados por todos os personagens da turminha
OPEN = {"X": 0.0, "MBP": 0.0, "FV": 0.18, "S": 0.25, "L": 0.42, "U": 0.5, "I": 0.5, "E": 0.72, "O": 0.82, "A": 1.0}


def read_mono_samples(path):
    """Converte qualquer áudio para WAV mono 16 kHz com ffmpeg e devolve (amostras, taxa)."""
    with tempfile.TemporaryDirectory() as tmp:
        wav_path = os.path.join(tmp, "a.wav")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", path, "-ac", "1", "-ar", "16000", wav_path], check=True)
        with wave.open(wav_path, "rb") as w:
            n = w.getnframes()
            data = w.readframes(n)
            return struct.unpack(f"<{n}h", data), w.getframerate()


def envelope(samples, sr, fps, n_frames):
    """RMS por frame, normalizado pelo percentil 95, com ataque rápido e soltura mais lenta."""
    hop = sr / fps
    rms = []
    for f in range(n_frames):
        a, b = int(f * hop), int((f + 1) * hop)
        chunk = samples[a:b]
        rms.append(math.sqrt(sum(s * s for s in chunk) / len(chunk)) if chunk else 0.0)
    ref = sorted(rms)[int(len(rms) * 0.95)] or 1.0
    env, prev = [], 0.0
    for r in rms:
        x = min(1.0, r / ref)
        prev = prev + (x - prev) * (0.75 if x > prev else 0.35)
        env.append(prev)
    return env


def strip_accents(s):
    return "".join(c for c in unicodedata.normalize("NFD", s.lower()) if unicodedata.category(c) != "Mn")


def viseme_from_letters(text, i):
    """Visema de uma letra em pt-BR (ortografia é bem fonética), olhando dígrafos simples."""
    c = strip_accents(text[i])
    nxt = strip_accents(text[i + 1]) if i + 1 < len(text) else ""
    if c in "a":
        return "A"
    if c in "e":
        return "E"
    if c in "iy":
        return "I"
    if c in "o":
        return "O"
    if c in "uw":
        return "U"
    if c in "mbp":
        return "MBP"
    if c in "fv":
        return "FV"
    if c in "szxjç" or (c == "c" and nxt in "eih") or (c == "g" and nxt in "ei"):
        return "S"
    if c.isalpha():
        return "L"
    return "X"


def viseme_from_espeak(ph):
    p = ph.replace("'", "").replace(",", "").replace(":", "").replace(";", "").replace("~", "")
    if not p or p.startswith("_"):
        return "X"
    if p.startswith(("tS", "dZ")):
        return "S"
    head = p[0]
    table = {
        "a": "A", "&": "A", "6": "A",
        "E": "E", "e": "E",
        "i": "I", "I": "I", "y": "I", "j": "I",
        "O": "O", "o": "O",
        "u": "U", "U": "U", "w": "U",
        "m": "MBP", "b": "MBP", "p": "MBP",
        "f": "FV", "v": "FV",
        "s": "S", "z": "S", "S": "S", "Z": "S",
    }
    return table.get(head, "L")


def segments_from_espeak(t):
    ph = t["phonemes"]
    end_ms = t["durationMs"]
    segs = []
    for k, p in enumerate(ph):
        a = p["ms"] / 1000
        b = (ph[k + 1]["ms"] if k + 1 < len(ph) else end_ms) / 1000
        segs.append((a, b, viseme_from_espeak(p["ph"])))
    words = []
    for k, w in enumerate(t["words"]):
        a = w["ms"] / 1000
        b = (t["words"][k + 1]["ms"] if k + 1 < len(t["words"]) else end_ms) / 1000
        words.append((w["word"], a, b))
    return segs, words


def segments_from_elevenlabs(t):
    al = t.get("alignment") or t.get("normalized_alignment") or t
    chars = al["characters"]
    starts = al["character_start_times_seconds"]
    ends = al["character_end_times_seconds"]
    text = "".join(chars)
    segs = [(starts[i], ends[i], viseme_from_letters(text, i)) for i in range(len(chars))]
    words, cur, cur_a, cur_b = [], "", None, None
    for i, ch in enumerate(chars):
        if ch.isspace():
            if cur:
                words.append((cur, cur_a, cur_b))
            cur, cur_a = "", None
            continue
        if cur_a is None:
            cur_a = starts[i]
        cur += ch
        cur_b = ends[i]
    if cur:
        words.append((cur, cur_a, cur_b))
    return segs, words


def words_from_energy(text, env, fps, gate):
    """Sem alinhamento: espalha as palavras pela fala detectada, proporcional ao número de letras."""
    voiced = [f for f, e in enumerate(env) if e > gate]
    if not voiced:
        return []
    a, b = voiced[0] / fps, (voiced[-1] + 1) / fps
    toks = text.split()
    total = sum(len(t) + 1 for t in toks)
    words, acc = [], 0
    for t in toks:
        wa = a + (b - a) * acc / total
        acc += len(t) + 1
        words.append((t, wa, a + (b - a) * acc / total))
    return words


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--audio", required=True)
    ap.add_argument("--text", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--timing")
    ap.add_argument("--fps", type=int, default=30)
    args = ap.parse_args()

    samples, sr = read_mono_samples(args.audio)
    dur = len(samples) / sr
    n_frames = math.ceil(dur * args.fps)
    env = envelope(samples, sr, args.fps, n_frames)
    gate = 0.08

    segs, words, source = [], [], "volume"
    if args.timing:
        with open(args.timing, encoding="utf-8") as fh:
            t = json.load(fh)
        if "phonemes" in t:
            segs, words = segments_from_espeak(t)
            source = "espeak"
        else:
            segs, words = segments_from_elevenlabs(t)
            source = "elevenlabs"
    if not words:
        words = words_from_energy(args.text, env, args.fps, gate)

    frames, k = [], 0
    for f in range(n_frames):
        tc = (f + 0.5) / args.fps
        e = env[f]
        if segs:
            while k + 1 < len(segs) and segs[k][1] <= tc:
                k += 1
            v = segs[k][2] if segs[k][0] <= tc < segs[k][1] else "X"
        else:
            v = "A" if e > 0.55 else "E" if e > 0.3 else "L"
        if e < gate:
            v = "X"
        # abertura = forma do visema modulada pelo volume real (evita boca aberta no silêncio)
        o = OPEN[v] * (0.55 + 0.45 * min(1.0, e / 0.6))
        frames.append({"v": v, "o": round(o, 3)})

    # segura cada visema por no mínimo 2 frames (sem tremedeira)
    for f in range(1, n_frames - 1):
        if frames[f]["v"] != frames[f - 1]["v"] and frames[f]["v"] != frames[f + 1]["v"]:
            frames[f] = dict(frames[f - 1])

    out = {
        "fps": args.fps,
        "source": source,
        "audioSeconds": round(dur, 3),
        "frames": frames,
        "words": [{"text": w, "start": round(a * args.fps), "end": max(round(a * args.fps) + 1, round(b * args.fps))} for w, a, b in words],
    }
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False)
    print(f"ok fonte={source} duracao={dur:.2f}s frames={n_frames} palavras={len(out['words'])}")


if __name__ == "__main__":
    main()
