"""Corta a gravação em trechos curtos, sempre no fim de uma frase, para o estilizador de vídeo.

Os modelos de vídeo-para-vídeo aceitam poucos segundos por vez; cortar em frases deixa a emenda
invisível (a edição já tem corte com zoom ou B-roll nesses pontos). A voz original sai inteira
em um arquivo separado: o vídeo estilizado é sempre montado por cima da voz real.

Uso:
  python -I fatiar_aroll.py --video gravacao.mov --palavras palavras.json --saida pasta/ [--max 10]
Saídas: pasta/trecho-01.mp4 ... (sem áudio, 9:16, 30 fps), pasta/voz.wav, pasta/trechos.json
"""
import argparse
import json
import os
import subprocess


def cortes(palavras, total, maximo, minimo_trechos=3):
    """Pontos de corte no fim de frases (ou de vírgulas): n trechos parecidos, n = max(minimo_trechos, total/maximo)
    a partir de 9 s (a versão B precisa de 3: feltro no começo e no fim). Cada trecho tem de 3 s (mínimo do Act-Two)
    a 30 s; sem ponto bom, cai na divisão antiga (gulosa, até `maximo`)."""
    import math
    fins = sorted({p["end"] for p in palavras if p["text"].rstrip().endswith((".", "!", "?"))})
    virgulas = sorted({p["end"] for p in palavras if p["text"].rstrip().endswith((",", ";", ":"))})
    n = max(math.ceil(total / maximo), minimo_trechos if total >= 9.0 else 1)
    pontos = []
    for k in range(1, n):
        alvo = total * k / n
        anterior = pontos[-1] if pontos else 0.0
        ok = lambda x: x - anterior >= 3.0 and total - x >= 3.0 * (n - k)
        cand = [x for x in fins if ok(x)] or [x for x in virgulas if ok(x)]
        if not cand:
            break
        pontos.append(min(cand, key=lambda x: abs(x - alvo)))
    marcos = [0.0] + pontos + [total]
    if len(pontos) == n - 1 and all(3.0 <= b - a <= 30.0 for a, b in zip(marcos, marcos[1:])):
        return marcos
    return cortes_gulosos(palavras, total, maximo)


def cortes_gulosos(palavras, total, maximo):
    """Escolhe pontos de corte no fim de frases (ou de vírgulas, se a frase for longa demais)."""
    fins_frase = [p["end"] for p in palavras if p["text"].rstrip().endswith((".", "!", "?"))]
    fins_virgula = [p["end"] for p in palavras if p["text"].rstrip().endswith((",", ";", ":"))]
    pontos, inicio = [], 0.0
    while total - inicio > maximo:
        janela = [x for x in fins_frase if inicio + 2.0 <= x <= inicio + maximo]
        if not janela:
            janela = [x for x in fins_virgula if inicio + 2.0 <= x <= inicio + maximo]
        corte = max(janela) if janela else inicio + maximo
        pontos.append(corte)
        inicio = corte
    # último trecho com menos de 3 s (mínimo do Act-Two) ficaria com o rosto real no fim: junta com o anterior
    if pontos and total - pontos[-1] < 3.0 and total - (pontos[-2] if len(pontos) > 1 else 0.0) <= 30.0:
        pontos.pop()
    return [0.0] + pontos + [total]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", required=True)
    ap.add_argument("--palavras", required=True)
    ap.add_argument("--saida", required=True)
    ap.add_argument("--max", type=float, default=10.0)
    args = ap.parse_args()

    with open(args.palavras, encoding="utf-8") as fh:
        palavras = json.load(fh)
    total = float(
        subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", args.video],
            capture_output=True, text=True, check=True,
        ).stdout.strip()
    )
    os.makedirs(args.saida, exist_ok=True)
    marcos = cortes(palavras, total, args.max)
    trechos = []
    for i in range(len(marcos) - 1):
        de, ate = marcos[i], marcos[i + 1]
        nome = f"trecho-{i + 1:02d}.mp4"
        subprocess.run(
            ["ffmpeg", "-v", "error", "-y", "-ss", f"{de:.3f}", "-i", args.video, "-t", f"{ate - de:.3f}", "-an",
             "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30",
             "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", os.path.join(args.saida, nome)],
            check=True,
        )
        trechos.append({"arquivo": nome, "de": round(de, 3), "ate": round(ate, 3)})
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", args.video, "-vn", "-ac", "1", "-ar", "48000", os.path.join(args.saida, "voz.wav")], check=True)
    with open(os.path.join(args.saida, "trechos.json"), "w", encoding="utf-8") as fh:
        json.dump({"duracao": round(total, 3), "trechos": trechos}, fh, ensure_ascii=False, indent=1)
    print(f"ok {len(trechos)} trechos, {total:.1f}s: " + ", ".join(f"{t['de']:.1f}-{t['ate']:.1f}" for t in trechos))


if __name__ == "__main__":
    main()
