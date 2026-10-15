"""Tira o fundo das fotos de produto, sem mexer no produto (só recorta e dá uma nitidez leve).

Roda local e de graça: modelo ISNet (o mesmo do rembg), baixado uma vez dos releases do GitHub.
Saída: PNG com transparência, recortado no contorno do produto, em <saida>/<nome>.png, e uma prévia
lado a lado (original | recorte sobre o creme da marca) em <saida>/previa-<nome>.jpg para conferir.

Dependências: pip install onnxruntime pillow numpy
Uso: python3 -I scripts/recortar_fundo.py public/produto/pasta-de-descobertas/*.jpg --saida public/produto/pasta-de-descobertas/tratadas
"""
import argparse
import hashlib
import os
import urllib.request

import numpy as np
import onnxruntime as ort
from PIL import Image, ImageFilter

MODELO_URL = "https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx"
MODELO_MD5 = "fc16ebd8b0c10d971d3513d564d01e29"
CREME = (247, 244, 238)


def baixar_modelo(caminho):
    if not os.path.exists(caminho):
        os.makedirs(os.path.dirname(caminho), exist_ok=True)
        urllib.request.urlretrieve(MODELO_URL, caminho + ".tmp")
        os.replace(caminho + ".tmp", caminho)
    md5 = hashlib.md5()
    with open(caminho, "rb") as fh:
        for bloco in iter(lambda: fh.read(1 << 20), b""):
            md5.update(bloco)
    if md5.hexdigest() != MODELO_MD5:
        raise SystemExit(f"modelo corrompido: {caminho} (apague e rode de novo)")
    return caminho


def mascara(sessao, img):
    """Pré-processamento igual ao do rembg (sessão isnet-general-use): 1024x1024, média 0,5, desvio 1."""
    x = np.asarray(img.convert("RGB").resize((1024, 1024), Image.Resampling.LANCZOS), dtype=np.float64)
    x = x / max(x.max(), 1e-6) - 0.5
    entrada = {sessao.get_inputs()[0].name: x.transpose(2, 0, 1)[None].astype(np.float32)}
    pred = sessao.run(None, entrada)[0][0, 0]
    pred = (pred - pred.min()) / max(pred.max() - pred.min(), 1e-6)
    return Image.fromarray((pred * 255).astype(np.uint8), mode="L").resize(img.size, Image.Resampling.LANCZOS)


def recortar(sessao, caminho, saida):
    img = Image.open(caminho).convert("RGB")
    alfa = np.asarray(mascara(sessao, img), dtype=np.float64) / 255
    alfa = np.clip((alfa - 0.08) / 0.84, 0, 1)  # limpa o véu do fundo sem comer a borda do produto
    ys, xs = np.nonzero(alfa > 0.5)
    if not len(xs):
        raise SystemExit(f"não achei produto em {caminho}")
    m = int(0.03 * max(img.size))
    caixa = (max(0, xs.min() - m), max(0, ys.min() - m), min(img.width, xs.max() + m + 1), min(img.height, ys.max() + m + 1))
    nitida = img.filter(ImageFilter.UnsharpMask(radius=1.2, percent=40, threshold=2))
    rgba = nitida.copy()
    rgba.putalpha(Image.fromarray((alfa * 255).astype(np.uint8), mode="L"))
    rgba = rgba.crop(caixa)
    nome = os.path.splitext(os.path.basename(caminho))[0]
    rgba.save(os.path.join(saida, nome + ".png"))
    # prévia para conferir: original | recorte sobre o creme
    fundo = Image.new("RGB", rgba.size, CREME)
    fundo.paste(rgba, (0, 0), rgba)
    orig = img.crop(caixa)
    previa = Image.new("RGB", (orig.width * 2 + 20, orig.height), (255, 255, 255))
    previa.paste(orig, (0, 0))
    previa.paste(fundo, (orig.width + 20, 0))
    previa.save(os.path.join(saida, f"previa-{nome}.jpg"), quality=88)
    return os.path.join(saida, nome + ".png"), rgba.size


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("fotos", nargs="+")
    ap.add_argument("--saida", required=True)
    ap.add_argument("--modelo", default=os.path.expanduser("~/.cache/rocco/isnet-general-use.onnx"))
    args = ap.parse_args()
    os.makedirs(args.saida, exist_ok=True)
    sessao = ort.InferenceSession(baixar_modelo(args.modelo), providers=["CPUExecutionProvider"])
    for f in args.fotos:
        png, tam = recortar(sessao, f, args.saida)
        print(f"ok {png} {tam[0]}x{tam[1]}")


if __name__ == "__main__":
    main()
