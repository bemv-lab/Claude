"""Deixa o áudio do vídeo no padrão de Reels/Meta (-14 LUFS, pico -1,5 dBTP) e otimiza para streaming.

Faz loudnorm em duas passadas (mede e depois aplica), copia o vídeo sem recodificar
e move o índice do MP4 para o começo (+faststart), para tocar logo no celular.
Uso: python -I finalizar_audio.py entrada.mp4 saida.mp4
"""
import json
import re
import subprocess
import sys

ALVO = "I=-14:TP=-1.5:LRA=11"


def main():
    entrada, saida = sys.argv[1], sys.argv[2]
    medida = subprocess.run(
        ["ffmpeg", "-hide_banner", "-i", entrada, "-vn", "-af", f"loudnorm={ALVO}:print_format=json", "-f", "null", "-"],
        capture_output=True,
        text=True,
        check=True,
    ).stderr
    m = json.loads(re.findall(r"\{[^{}]*\}", medida)[-1])
    filtro = (
        f"loudnorm={ALVO}:measured_I={m['input_i']}:measured_TP={m['input_tp']}"
        f":measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true"
    )
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", entrada, "-c:v", "copy", "-af", filtro, "-ar", "48000", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", saida],
        check=True,
    )
    print(f"ok {saida} (antes: {m['input_i']} LUFS)")


if __name__ == "__main__":
    main()
