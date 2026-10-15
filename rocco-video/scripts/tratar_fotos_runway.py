"""Trata fotos de produto com modelos de imagem do Gemini PELA RUNWAY (créditos da Runway, sem cobrança no Google).

Usa o mesmo prompt e a mesma pasta de saída do tratar_fotos_gemini.py (tratadas/gemini/<nome>-<k>.png),
então `tratar_fotos_gemini.py promover` e a checagem visual peça por peça valem igual.

Uso:
  python3 -I scripts/tratar_fotos_runway.py FOTO [FOTO ...] [--modelo gemini_image3.1_flash] [--ratio 1360:1020]
      [--teto-creditos 100] [--variante 1] [--descricao "..."]
Idempotente: o estado (tratadas/gemini/estado-runway-fotos.json) guarda a tarefa de cada foto/modelo/variante.
US$ 0,01 por crédito. O teto conta o estimatedCost devolvido pela Runway.
"""
import argparse, base64, hashlib, importlib.util, json, mimetypes, os, time, urllib.error, urllib.request

API = "https://api.dev.runwayml.com"
VERSAO = "2024-11-06"
AQUI = os.path.dirname(os.path.abspath(__file__))


def prompt_base():
    spec = importlib.util.spec_from_file_location("tfg", os.path.join(AQUI, "tratar_fotos_gemini.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.PROMPT, mod.PROMPT_VERSAO


def chamar(metodo, caminho, corpo=None):
    h = {"X-Runway-Version": VERSAO}
    if corpo is not None:
        h["Content-Type"] = "application/json"
    chave = os.environ.get("RUNWAYML_API_SECRET")
    if chave:
        h["Authorization"] = f"Bearer {chave}"
    req = urllib.request.Request(API + caminho, data=json.dumps(corpo).encode() if corpo is not None else None, method=metodo, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        raise SystemExit(f"Runway HTTP {e.code}: {e.read().decode()[:800]}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("fotos", nargs="+")
    ap.add_argument("--modelo", default="gemini_image3.1_flash")
    ap.add_argument("--ratio", default="1360:1020")
    ap.add_argument("--variante", type=int, default=1)
    ap.add_argument("--teto-creditos", type=float, default=100)
    ap.add_argument("--descricao", default="")
    args = ap.parse_args()
    prompt, versao = prompt_base()
    if args.descricao:
        prompt += f"\n\nProduct details that must stay exactly the same: {args.descricao.strip()}"
    for foto in args.fotos:
        pasta = os.path.join(os.path.dirname(foto), "tratadas", "gemini")
        os.makedirs(pasta, exist_ok=True)
        estado_arq = os.path.join(pasta, "estado-runway-fotos.json")
        estado = json.load(open(estado_arq)) if os.path.exists(estado_arq) else {"fotos": {}}
        nome = os.path.splitext(os.path.basename(foto))[0]
        sha = hashlib.sha256(open(foto, "rb").read()).hexdigest()
        chave = f"{sha}|{args.modelo}|{versao}|v{args.variante}|{args.ratio}"
        saida = os.path.join(pasta, f"{nome}-r{args.variante}.png")
        reg = estado["fotos"].get(chave)
        gasto = sum(r.get("creditos", 0) for r in estado["fotos"].values())
        if reg and reg.get("arquivo") and os.path.exists(reg["arquivo"]):
            print(f"{nome}: já existe {reg['arquivo']}")
            continue
        if not reg:
            tipo = mimetypes.guess_type(foto)[0] or "image/jpeg"
            uri = f"data:{tipo};base64," + base64.b64encode(open(foto, "rb").read()).decode()
            corpo = {"model": args.modelo, "promptText": prompt, "ratio": args.ratio,
                     "referenceImages": [{"uri": uri, "tag": "produto"}]}
            criada = chamar("POST", "/v1/text_to_image", corpo)
            est = criada.get("estimatedCost", {}).get("credits", 0) if isinstance(criada.get("estimatedCost"), dict) else 0
            reg = {"id": criada["id"], "estimado": est, "creditos": est, "foto": foto}
            estado["fotos"][chave] = reg
            json.dump(estado, open(estado_arq, "w"), indent=1)
            print(f"{nome}: tarefa {criada['id']} (~{est} créditos)")
            if gasto + est > args.teto_creditos:
                raise SystemExit(f"teto de {args.teto_creditos} créditos passado (já {gasto} + {est}); parei depois de criar esta tarefa")
        while True:
            t = chamar("GET", f"/v1/tasks/{reg['id']}")
            if t["status"] in ("SUCCEEDED", "FAILED", "CANCELLED"):
                break
            time.sleep(4)
        if t["status"] != "SUCCEEDED":
            raise SystemExit(f"{nome}: {t['status']} {t.get('failureCode', '')} {t.get('failure', '')}")
        urllib.request.urlretrieve(t["output"][0], saida)
        reg["arquivo"] = saida
        json.dump(estado, open(estado_arq, "w"), indent=1)
        print(f"{nome}: ok {saida}")


if __name__ == "__main__":
    main()
