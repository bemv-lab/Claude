"""Transforma um trecho da gravação na "Bárbara de feltro" com o Runway Act-Two.

A imagem-mestra (personagem fixo) recebe a performance do trecho: boca, expressões e, com --corpo,
os gestos. O áudio NÃO passa pela Runway; a voz original é recolocada depois na montagem.

Idempotente: o id de cada tarefa fica em --estado; rodar de novo retoma a tarefa em vez de pagar outra.
Teto de gasto: soma os créditos já usados no --estado e não cria tarefa que passe de --teto-creditos.

Autenticação: se a chave estiver em "Network secrets" do ambiente, o proxy injeta o cabeçalho
(a chave nunca entra na máquina). Se existir RUNWAYML_API_SECRET, ela é usada diretamente.
Rede: liberar api.dev.runwayml.com e o host de download das saídas.

Uso:
  python -I feltro_runway.py --mestra mestra.png --trecho trecho-01.mp4 --saida feltro-01.mp4 \
      --estado estado.json [--intensidade 3] [--corpo] [--seed 42] [--teto-creditos 1000]
"""
import argparse
import base64
import json
import mimetypes
import os
import subprocess
import tempfile
import time
import urllib.request
import uuid

API = "https://api.dev.runwayml.com"
VERSAO = "2024-11-06"
CREDITOS_POR_SEGUNDO = 5  # tabela da Runway para act_two (US$ 0,01 por crédito)
LIMITE_DATA_URI = 3_600_000  # bytes do arquivo (~5 MB depois do base64)


def cabecalhos(json_body=True):
    h = {"X-Runway-Version": VERSAO}
    if json_body:
        h["Content-Type"] = "application/json"
    chave = os.environ.get("RUNWAYML_API_SECRET")
    if chave:
        h["Authorization"] = f"Bearer {chave}"
    return h


def chamar(metodo, caminho, corpo=None):
    dados = json.dumps(corpo).encode() if corpo is not None else None
    req = urllib.request.Request(API + caminho, data=dados, method=metodo, headers=cabecalhos(corpo is not None))
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)


def duracao(caminho):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", caminho], capture_output=True, text=True, check=True)
    return float(out.stdout.strip())


def data_uri(caminho):
    tipo = mimetypes.guess_type(caminho)[0] or "application/octet-stream"
    with open(caminho, "rb") as fh:
        return f"data:{tipo};base64,{base64.b64encode(fh.read()).decode()}"


def enviar_arquivo(caminho):
    """Arquivos grandes: upload efêmero da Runway (devolve runway://...)."""
    up = chamar("POST", "/v1/uploads", {"filename": os.path.basename(caminho), "type": "ephemeral"})
    limite = "----rocco" + uuid.uuid4().hex
    partes = []
    for k, v in up["fields"].items():
        partes.append(f'--{limite}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
    with open(caminho, "rb") as fh:
        conteudo = fh.read()
    tipo = mimetypes.guess_type(caminho)[0] or "application/octet-stream"
    partes.append(f'--{limite}\r\nContent-Disposition: form-data; name="file"; filename="{os.path.basename(caminho)}"\r\nContent-Type: {tipo}\r\n\r\n'.encode() + conteudo + b"\r\n")
    partes.append(f"--{limite}--\r\n".encode())
    req = urllib.request.Request(up["uploadUrl"], data=b"".join(partes), method="POST", headers={"Content-Type": f"multipart/form-data; boundary={limite}"})
    urllib.request.urlopen(req, timeout=300).read()
    return up["runwayUri"]


def referencia_leve(trecho, pasta):
    """Versão da performance para envio: 720x1280, 24 qps, sem áudio, ~1,2 Mbps."""
    saida = os.path.join(pasta, "ref.mp4")
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", trecho, "-an", "-vf", "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,fps=24",
         "-c:v", "libx264", "-b:v", "1200k", "-maxrate", "1400k", "-bufsize", "2800k", "-pix_fmt", "yuv420p", saida],
        check=True,
    )
    return saida


def carregar(estado):
    if os.path.exists(estado):
        with open(estado, encoding="utf-8") as fh:
            return json.load(fh)
    return {"tarefas": {}}


def salvar(estado, dados):
    tmp = estado + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(dados, fh, ensure_ascii=False, indent=1)
    os.replace(tmp, estado)


def creditos_usados(dados):
    return sum(t.get("creditos", t.get("estimado", 0)) for t in dados["tarefas"].values() if t.get("status") != "FAILED")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mestra", required=True)
    ap.add_argument("--trecho", required=True)
    ap.add_argument("--saida", required=True)
    ap.add_argument("--estado", required=True)
    ap.add_argument("--intensidade", type=int, default=3)
    ap.add_argument("--corpo", action="store_true")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--teto-creditos", type=float, default=1000)
    args = ap.parse_args()

    chave_trecho = f"{os.path.abspath(args.trecho)}|i{args.intensidade}|c{int(args.corpo)}|s{args.seed}"
    dados = carregar(args.estado)
    tarefa = dados["tarefas"].get(chave_trecho)

    if not tarefa or tarefa.get("status") == "FAILED":
        segundos = duracao(args.trecho)
        if not 3 <= segundos <= 30:
            raise SystemExit(f"trecho com {segundos:.1f}s: o Act-Two aceita de 3 a 30 s")
        estimado = CREDITOS_POR_SEGUNDO * segundos
        if creditos_usados(dados) + estimado > args.teto_creditos:
            raise SystemExit(f"teto de gasto: {creditos_usados(dados):.0f} usados + {estimado:.0f} estimados > {args.teto_creditos:.0f} créditos")
        with tempfile.TemporaryDirectory() as tmp:
            ref = referencia_leve(args.trecho, tmp)
            ref_uri = data_uri(ref) if os.path.getsize(ref) <= LIMITE_DATA_URI else enviar_arquivo(ref)
            corpo = {
                "model": "act_two",
                "character": {"type": "image", "uri": data_uri(args.mestra)},
                "reference": {"type": "video", "uri": ref_uri},
                "ratio": "720:1280",
                "bodyControl": bool(args.corpo),
                "expressionIntensity": args.intensidade,
                "seed": args.seed,
            }
            criada = chamar("POST", "/v1/character_performance", corpo)
        tarefa = {"id": criada["id"], "status": "PENDING", "estimado": criada.get("estimatedCost", {}).get("credits", estimado), "trecho": args.trecho}
        dados["tarefas"][chave_trecho] = tarefa
        salvar(args.estado, dados)
        print(f"tarefa criada {tarefa['id']} (~{tarefa['estimado']:.0f} créditos)")

    # acompanha até terminar
    while True:
        t = chamar("GET", f"/v1/tasks/{tarefa['id']}")
        tarefa["status"] = t["status"]
        if t["status"] in ("SUCCEEDED", "FAILED", "CANCELLED"):
            tarefa["creditos"] = t.get("cost", {}).get("credits", tarefa.get("estimado", 0)) if isinstance(t.get("cost"), dict) else t.get("cost", tarefa.get("estimado", 0))
            salvar(args.estado, dados)
            break
        time.sleep(6)

    if tarefa["status"] != "SUCCEEDED":
        raise SystemExit(f"tarefa {tarefa['id']} terminou como {tarefa['status']}: {t.get('failureCode', '')} {t.get('failure', '')}")
    # as URLs expiram em 24-48 h: baixa na hora
    urllib.request.urlretrieve(t["output"][0], args.saida)
    tarefa["arquivo"] = args.saida
    salvar(args.estado, dados)
    print(f"ok {args.saida} ({tarefa.get('creditos', 0)} créditos)")


if __name__ == "__main__":
    main()
