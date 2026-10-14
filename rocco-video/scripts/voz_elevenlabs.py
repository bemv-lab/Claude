"""Gera a locução no ElevenLabs JÁ com o alinhamento por caractere (para boca e legenda).

Precisa: variável de ambiente ELEVENLABS_API_KEY e o domínio api.elevenlabs.io liberado na rede.
Uso:
  python -I voz_elevenlabs.py --voice <voice_id> --text-file roteiro.txt --out public/voz/fala \
      [--model eleven_multilingual_v2] [--stability 0.55] [--similarity 0.8] [--style 0.15] [--speed 0.95]
Saída: <out>.mp3 e <out>.alignment.json
"""
import argparse
import base64
import json
import os
import urllib.request


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--voice", required=True)
    ap.add_argument("--text-file", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--model", default="eleven_multilingual_v2")
    ap.add_argument("--stability", type=float, default=0.55)
    ap.add_argument("--similarity", type=float, default=0.8)
    ap.add_argument("--style", type=float, default=0.15)
    ap.add_argument("--speed", type=float, default=0.95)
    args = ap.parse_args()

    key = os.environ.get("ELEVENLABS_API_KEY")
    if not key:
        raise SystemExit("Defina ELEVENLABS_API_KEY (como secret do ambiente, nunca no código).")
    with open(args.text_file, encoding="utf-8") as fh:
        text = fh.read().strip()

    body = {
        "text": text,
        "model_id": args.model,
        "language_code": "pt",
        "voice_settings": {
            "stability": args.stability,
            "similarity_boost": args.similarity,
            "style": args.style,
            "use_speaker_boost": True,
            "speed": args.speed,
        },
    }
    req = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{args.voice}/with-timestamps?output_format=mp3_44100_128",
        data=json.dumps(body).encode(),
        headers={"xi-api-key": key, "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        res = json.load(r)

    with open(args.out + ".mp3", "wb") as fh:
        fh.write(base64.b64decode(res["audio_base64"]))
    with open(args.out + ".alignment.json", "w", encoding="utf-8") as fh:
        json.dump({"alignment": res.get("alignment"), "normalized_alignment": res.get("normalized_alignment")}, fh, ensure_ascii=False)
    print(f"ok {args.out}.mp3 + alinhamento ({len(text)} caracteres)")


if __name__ == "__main__":
    main()
