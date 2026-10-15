"""Fábrica de vídeos da Rocco: gravações do iPhone -> vídeos editados na marca (e, se ligado, em feltro).

Para cada gravação:
  1. padroniza (HEVC/HDR/60 qps do iPhone -> H.264 SDR 1080x1920 30 qps)
  2. transcreve com tempo por palavra (Parakeet local) e reconhece a claquete "Roteiro N, take M"
  3. alinha a fala ao roteiro (grafia do roteiro nas legendas) e posiciona as marcações [B-ROLL]/[CARTÃO]/[JANELA]
  4. corta em trechos no fim das frases
  5. motor de feltro (opcional, Runway Act-Two) por trecho, com a voz original sempre por cima
  6. monta as versões A (feltro), B (feltro no começo e no fim) e C (real) no molde Rocco-UGC
  7. renderiza, normaliza o áudio (-14 LUFS), gera capa e relatório

Uso:
  python3 -I scripts/processar_lote.py --entrada pasta_ou_arquivos... --lote 2026-10-15 \
      [--motor nenhum|runway] [--mestra public/feltro/mestra.png] [--teto-usd 10] \
      [--python-asr python] [--modelo-asr /opt/asr/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8]
Saídas: out/lotes/<lote>/<video>/ (MP4 por versão, capa.jpg, legenda.txt) e out/lotes/<lote>/relatorio.json
"""
import argparse
import difflib
import json
import os
import re
import shutil
import subprocess
import sys
import unicodedata

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPTS = os.path.join(RAIZ, "scripts")
PUBLIC = os.path.join(RAIZ, "public")
VIDEO_EXT = (".mov", ".mp4", ".m4v", ".hevc")
NUMEROS = {"um": 1, "uma": 1, "dois": 2, "duas": 2, "tres": 3, "quatro": 4, "cinco": 5, "seis": 6, "sete": 7, "oito": 8, "nove": 9, "dez": 10,
           "onze": 11, "doze": 12, "treze": 13, "catorze": 14, "quatorze": 14, "quinze": 15, "dezesseis": 16, "dezessete": 17, "dezoito": 18,
           "dezenove": 19, "vinte": 20, "trinta": 30, "quarenta": 40, "cinquenta": 50, "sessenta": 60, "setenta": 70, "oitenta": 80, "noventa": 90}
AVISO_FELTRO = "versão em feltro feita com IA · voz real da Bárbara"


def run(cmd, **kw):
    return subprocess.run(cmd, check=True, **kw)


def norm(p):
    p = unicodedata.normalize("NFD", p.lower())
    return re.sub(r"[^a-z0-9]", "", "".join(c for c in p if unicodedata.category(c) != "Mn"))


def sondar(video):
    out = subprocess.run(["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", "-show_format", video], capture_output=True, text=True, check=True)
    info = json.loads(out.stdout)
    v = next(s for s in info["streams"] if s["codec_type"] == "video")
    return {"transfer": v.get("color_transfer", ""), "duracao": float(info["format"]["duration"]), "audio": any(s["codec_type"] == "audio" for s in info["streams"])}


def duracao(arquivo):
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", arquivo], capture_output=True, text=True, check=True).stdout.strip())


def padronizar(video, saida, inicio=0.0):
    info = sondar(video)
    quadro = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30"
    if info["transfer"] in ("smpte2084", "arib-std-b67"):  # HDR do iPhone (Dolby Vision/HLG) -> SDR
        quadro = "zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p," + quadro
    run(["ffmpeg", "-v", "error", "-y", "-ss", f"{inicio:.3f}", "-i", video, "-vf", quadro + ",format=yuv420p", "-c:v", "libx264", "-crf", "18",
         "-c:a", "aac", "-b:a", "192k", "-ar", "48000", saida])
    return info


def transcrever(args, audio, saida, roteiro=None):
    cmd = [args.python_asr, "-I", os.path.join(SCRIPTS, "transcrever_parakeet.py"), "--audio", audio, "--modelo", args.modelo_asr, "--saida", saida]
    if roteiro:
        cmd += ["--roteiro", roteiro]
    out = run(cmd, capture_output=True, text=True).stdout
    m = re.search(r"concordancia fala x roteiro: ([0-9.]+)%", out)
    with open(saida, encoding="utf-8") as fh:
        return json.load(fh), (float(m.group(1)) if m else None)


def silencios(audio, minimo=0.8):
    """Pausas do áudio (ffmpeg silencedetect): lista de (início, fim) em segundos."""
    log = subprocess.run(["ffmpeg", "-hide_banner", "-i", audio, "-af", f"silencedetect=noise=-35dB:d={minimo}", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    ini = [float(x) for x in re.findall(r"silence_start: ([0-9.]+)", log)]
    fim = [float(x) for x in re.findall(r"silence_end: ([0-9.]+)", log)]
    return list(zip(ini, fim))


def claquete(palavras, audio):
    """Claquete falada no começo ('Roteiro 3, take 1' + 2 s de silêncio) -> (número do roteiro, segundo em que a fala começa).

    Não depende de ouvir a palavra 'roteiro' (a transcrição erra palavras soltas): acha a primeira pausa
    de 0,8 s ou mais nos primeiros 6 s de áudio e pega o primeiro número dito antes dela.
    """
    pausa = next(((a, b) for a, b in silencios(audio) if 0.5 < a < 6.0), None)
    if not pausa:
        return None, 0.0
    antes = [p for p in palavras if p["start"] < pausa[0]]
    if not antes or len(antes) > 6:
        return None, 0.0
    for p in antes:
        w = norm(p["text"])
        n = int(w) if w.isdigit() else NUMEROS.get(w)
        if n:
            return n, max(pausa[0] + 0.1, pausa[1] - 0.2)
    return None, 0.0


def numero_do_arquivo(caminho):
    m = re.match(r"^0*(\d+)", os.path.basename(caminho))
    return int(m.group(1)) if m else None


def similaridade(ditas, alvo):
    """Fração das palavras do roteiro (alvo) que aparecem, em ordem, na fala (ditas)."""
    sm = difflib.SequenceMatcher(a=ditas, b=alvo, autojunk=False)
    return sum(b.size for b in sm.get_matching_blocks()) / max(1, len(alvo))


def escolher_roteiro(palavras, apos):
    """Descobre pelo que foi FALADO qual roteiro da pasta roteiros/ foi gravado (a claquete pode estar errada)."""
    pasta = os.path.join(RAIZ, "roteiros")
    ditas = [norm(p["text"]) for p in palavras if p["start"] >= apos - 0.01]
    melhor = (0.0, None)
    for nome in sorted(os.listdir(pasta)) if os.path.isdir(pasta) else []:
        if not nome.endswith(".txt") or nome.startswith("9"):  # 9x = roteiros de teste
            continue
        caminho = os.path.join(pasta, nome)
        _, falado, _ = ler_roteiro(caminho)
        if not falado:
            continue
        nota = similaridade(ditas, [norm(w) for w in falado])
        if nota > melhor[0]:
            melhor = (nota, caminho)
    return (melhor[1], melhor[0] * 100) if melhor[0] >= 0.5 else (None, melhor[0] * 100)


def melhor_tomada(palavras, falado, audio, apos, avisos):
    """Quando a fala recomeça (falsas partidas, 'vou repetir'), fica com a última tomada completa.

    Testa cada palavra como possível começo e escolhe a que melhor casa com o roteiro (empate: a mais
    tardia); o corte vai para o fim da pausa que vem antes dela.
    """
    alvo = [norm(w) for w in falado]
    cand = [p for p in palavras if p["start"] >= apos - 0.01]
    ditas = [norm(p["text"]) for p in cand]
    melhor_i, melhor_nota = 0, -1.0
    for i in range(len(cand)):
        nota = similaridade(ditas[i: i + len(alvo) + 8], alvo)
        if nota >= melhor_nota:
            melhor_i, melhor_nota = i, nota
    inicio = cand[melhor_i]["start"]
    if melhor_i == 0:
        return apos
    pausas = [(a, b) for a, b in silencios(audio, 0.5) if inicio - 2.5 <= b <= inicio + 0.15]
    corte = max(pausas[-1][0] + 0.1, pausas[-1][1] - 0.2) if pausas else max(apos, inicio - 0.3)
    if corte - apos > 1.0:
        avisos.append(f"fala recomeçou: ignorei os primeiros {corte - apos:.0f}s (falsas partidas) e usei a última tomada")
    return corte


def ler_roteiro(caminho):
    """Cabeçalho 'chave: valor' até '---'; depois o texto falado e marcações [B-ROLL: arq | texto], [JANELA: ...], [CARTÃO: texto]."""
    meta, corpo = {}, []
    with open(caminho, encoding="utf-8") as fh:
        linhas = fh.read().splitlines()
    if "---" in linhas:
        cab = linhas[: linhas.index("---")]
        corpo = linhas[linhas.index("---") + 1:]
        for l in cab:
            if ":" in l and not l.startswith("#"):
                k, v = l.split(":", 1)
                meta[k.strip().lower()] = v.strip()
    else:
        corpo = linhas
    falado, marcas = [], []
    for l in corpo:
        s = l.strip()
        m = re.match(r"^\[(B-ROLL|JANELA|CART[AÃ]O)\s*:\s*(.+)\]$", s, re.I)
        if m:
            tipo = m.group(1).upper().replace("Ã", "A")
            partes = [x.strip() for x in m.group(2).split("|")]
            marcas.append({"tipo": tipo, "partes": partes, "palavra": len(falado)})
        elif s and not s.startswith("#"):
            falado.extend(s.split())
    return meta, falado, marcas


def achar_roteiro(n):
    pasta = os.path.join(RAIZ, "roteiros")
    for nome in sorted(os.listdir(pasta)) if os.path.isdir(pasta) else []:
        if re.match(rf"^0*{n}[-_ .]", nome):
            return os.path.join(pasta, nome)
    return None


def tempo_da_palavra(palavras, falado, idx, inicio_busca=0):
    """Instante em que a palavra idx do roteiro é dita: procura a sequência de até 3 palavras na fala."""
    if idx >= len(falado):
        return palavras[-1]["end"], len(palavras)
    alvo = [norm(w) for w in falado[idx: idx + 3]]
    ditas = [norm(p["text"]) for p in palavras]
    for i in range(inicio_busca, len(ditas)):
        if ditas[i] == alvo[0] and all(i + k >= len(ditas) or ditas[i + k] == alvo[k] for k in range(1, len(alvo))):
            return palavras[i]["start"], i
    for i in range(inicio_busca, len(ditas)):  # só a primeira palavra
        if ditas[i] == alvo[0]:
            return palavras[i]["start"], i
    frac = idx / max(1, len(falado))  # proporcional, se nada bater
    return palavras[0]["start"] + frac * (palavras[-1]["end"] - palavras[0]["start"]), inicio_busca


def fim_da_frase(palavras, i):
    for j in range(i, len(palavras)):
        if palavras[j]["text"].rstrip().endswith((".", "!", "?")):
            return palavras[j]["end"]
    return palavras[-1]["end"]


def resolver_midia(arquivo, produto):
    for base in ([os.path.join("produto", produto)] if produto else []) + ["broll", ""]:
        rel = os.path.join(base, arquivo) if base else arquivo
        if os.path.exists(os.path.join(PUBLIC, rel)):
            return rel
    return None


def insercoes(meta, falado, marcas, palavras, avisos):
    lista, busca = [], 0
    for k, m in enumerate(marcas):
        de, i = tempo_da_palavra(palavras, falado, m["palavra"], busca)
        busca = i
        ate = max(de + 1.5, min(fim_da_frase(palavras, i) + 0.2, de + 6.0))
        if k + 1 < len(marcas):  # nunca invade a próxima inserção
            prox, _ = tempo_da_palavra(palavras, falado, marcas[k + 1]["palavra"], i)
            ate = min(ate, max(de + 0.8, prox))
        if m["tipo"] == "CARTAO":
            lista.append({"tipo": "cartao", "de": round(de, 2), "ate": round(ate, 2), "texto": m["partes"][0].replace("\\n", "\n")})
            continue
        rel = resolver_midia(m["partes"][0], meta.get("produto"))
        if not rel:
            avisos.append(f"mídia não encontrada: {m['partes'][0]} (inserção pulada)")
            continue
        ins = {"tipo": "video" if rel.lower().endswith((".mp4", ".mov")) else "imagem", "src": rel, "de": round(de, 2), "ate": round(ate, 2),
               "modo": "janela" if m["tipo"] == "JANELA" else "tela-cheia"}
        if len(m["partes"]) > 1:
            ins["texto"] = m["partes"][1]
        lista.append(ins)
    return lista


def pos_feltro(entrada, dur_original, saida, stop_motion=False):
    """Ajusta a deriva de tempo do trecho em feltro, leva para 1080x1920 30 qps e tira o áudio."""
    fator = dur_original / duracao(entrada)
    filtros = [] if abs(fator - 1) < 0.002 else [f"setpts={fator:.6f}*PTS"]
    filtros += ["scale=1080:1920:flags=lanczos"] + (["fps=12"] if stop_motion else []) + ["fps=30", "format=yuv420p"]
    run(["ffmpeg", "-v", "error", "-y", "-i", entrada, "-an", "-vf", ",".join(filtros), "-c:v", "libx264", "-crf", "18", "-t", f"{dur_original:.3f}", saida])


def renderizar(args, plano, saida_mp4, pasta_tmp):
    props = os.path.join(pasta_tmp, os.path.basename(saida_mp4) + ".props.json")
    with open(props, "w", encoding="utf-8") as fh:
        json.dump({"plano": plano}, fh, ensure_ascii=False)
    bruto = saida_mp4.replace(".mp4", ".bruto.mp4")
    run(["npx", "remotion", "render", "src/index.ts", "Rocco-UGC", bruto, f"--props={props}", f"--browser-executable={args.navegador}",
         "--concurrency=4", "--crf=20", "--log=error"], cwd=RAIZ, capture_output=True)
    run([sys.executable, "-I", os.path.join(SCRIPTS, "finalizar_audio.py"), bruto, saida_mp4], capture_output=True)
    os.remove(bruto)


def processar(args, video, lote_pub, lote_out, gasto):
    nome = re.sub(r"[^A-Za-z0-9_-]", "_", os.path.splitext(os.path.basename(video))[0])
    pub = os.path.join(lote_pub, nome)
    out = os.path.join(lote_out, nome)
    os.makedirs(pub, exist_ok=True)
    os.makedirs(out, exist_ok=True)
    rel = {"video": video, "avisos": [], "saidas": []}

    # 1-2: padroniza, transcreve e acha a claquete
    bruto = os.path.join(pub, "bruto.mp4")
    padronizar(video, bruto)
    voz0 = os.path.join(pub, "voz0.wav")
    run(["ffmpeg", "-v", "error", "-y", "-i", bruto, "-vn", "-ac", "1", "-ar", "48000", voz0])
    palavras0, _ = transcrever(args, voz0, os.path.join(pub, "palavras0.json"))
    n, corte = claquete(palavras0, voz0)
    roteiro = args.roteiro
    if not roteiro:
        escolhido, nota = escolher_roteiro(palavras0, corte)
        if escolhido:
            roteiro = escolhido
            num = numero_do_arquivo(escolhido)
            if n and num != n:
                rel["avisos"].append(f"a claquete dizia 'Roteiro {n}', mas a fala é do roteiro {num} ({nota:.0f}% de acerto): usei o {num}")
        elif n:
            roteiro = achar_roteiro(n)
    if n and not roteiro:
        rel["avisos"].append(f"claquete 'Roteiro {n}' sem arquivo em roteiros/")
    if not n and not roteiro:
        rel["avisos"].append("sem roteiro reconhecido: vídeo editado sem marcações")
    meta, falado, marcas = ler_roteiro(roteiro) if roteiro else ({}, [], [])
    if falado:
        corte = melhor_tomada(palavras0, falado, voz0, corte, rel["avisos"])

    # 3: corta a claquete, transcreve de novo alinhando ao roteiro
    master = os.path.join(pub, "master.mp4")
    padronizar(bruto, master, inicio=corte)
    voz = os.path.join(pub, "voz.wav")
    run(["ffmpeg", "-v", "error", "-y", "-i", master, "-vn", "-ac", "1", "-ar", "48000", voz])
    roteiro_falado = None
    if roteiro:
        roteiro_falado = os.path.join(pub, "roteiro-falado.txt")
        with open(roteiro_falado, "w", encoding="utf-8") as fh:
            fh.write(" ".join(falado))
    palavras, conc = transcrever(args, voz, os.path.join(pub, "palavras.json"), roteiro_falado)
    rel.update({"roteiro": os.path.basename(roteiro) if roteiro else None, "concordancia": conc, "duracao": round(duracao(master), 2)})
    if conc is not None and conc < 88:
        rel["avisos"].append(f"concordância fala x roteiro {conc:.0f}% (<88%): conferir legenda (ruído ou improviso)")

    # 4: trechos no fim das frases (até 20 s, limite confortável do Act-Two)
    run([sys.executable, "-I", os.path.join(SCRIPTS, "fatiar_aroll.py"), "--video", master, "--palavras", os.path.join(pub, "palavras.json"),
         "--saida", os.path.join(pub, "trechos"), "--max", "20"], capture_output=True)
    with open(os.path.join(pub, "trechos", "trechos.json"), encoding="utf-8") as fh:
        trechos = json.load(fh)
    rel_pub = os.path.relpath(pub, PUBLIC)
    reais = [{"src": f"{rel_pub}/trechos/{t['arquivo']}", "de": t["de"], "ate": t["ate"]} for t in trechos["trechos"]]

    # 5: feltro por trecho
    feltros = None
    if args.motor == "runway":
        feltros = []
        estado = os.path.join(lote_out, "estado-runway.json")
        teto_creditos = args.teto_usd * 100
        for t in trechos["trechos"]:
            dur = t["ate"] - t["de"]
            if dur < 3:
                feltros.append(None)  # curto demais para o Act-Two: fica real
                rel["avisos"].append(f"{t['arquivo']} tem {dur:.1f}s (<3s): mantido real")
                continue
            bruto_f = os.path.join(pub, "trechos", t["arquivo"].replace("trecho", "feltro-bruto"))
            final_f = os.path.join(pub, "trechos", t["arquivo"].replace("trecho", "feltro"))
            try:
                run([sys.executable, "-I", os.path.join(SCRIPTS, "feltro_runway.py"), "--mestra", args.mestra, "--trecho", os.path.join(pub, "trechos", t["arquivo"]),
                     "--saida", bruto_f, "--estado", estado, "--teto-creditos", str(teto_creditos), "--corpo"], capture_output=True, text=True)
                pos_feltro(bruto_f, dur, final_f, stop_motion=args.stop_motion)
                feltros.append(f"{rel_pub}/trechos/{os.path.basename(final_f)}")
            except subprocess.CalledProcessError as e:
                feltros.append(None)
                rel["avisos"].append(f"feltro falhou em {t['arquivo']}: {(e.stderr or e.stdout or '').strip()[-300:]}")
        with open(estado, encoding="utf-8") as fh:
            gasto["creditos"] = sum(x.get("creditos", 0) for x in json.load(fh)["tarefas"].values())

    # 6-7: versões
    base = {
        "audio": f"{rel_pub}/voz.wav",
        "duracao": rel["duracao"],
        "palavras": palavras,
        "insercoes": insercoes(meta, falado, marcas, palavras, rel["avisos"]) if roteiro else [],
        "assinatura": meta.get("assinatura", "Bárbara · Rocco Kids"),
        "prototipo": False,
    }
    if meta.get("titulo"):
        base["titulo"] = {"texto": meta["titulo"], "ate": round(min(4.0, fim_da_frase(palavras, 0)), 2)}
    if meta.get("cta"):
        base["cta"] = {"texto": meta["cta"], "site": meta.get("site", "roccokids.com.br")}
    versoes = {"C": reais}
    if feltros:
        a = [dict(r, src=f) if f else r for r, f in zip(reais, feltros)]
        versoes["A"] = a
        if len(reais) >= 3:
            versoes["B"] = [a[0]] + reais[1:-1] + [a[-1]]
    tmp = os.path.join(pub, "props")
    os.makedirs(tmp, exist_ok=True)
    for v in sorted(versoes):
        plano = dict(base, arolls=versoes[v])
        if v != "C":
            plano["aviso"] = AVISO_FELTRO
        saida = os.path.join(out, f"{nome}-{v}.mp4")
        renderizar(args, plano, saida, tmp)
        run(["ffmpeg", "-v", "error", "-y", "-i", saida, "-c:v", "libx264", "-crf", "27", "-preset", "slow", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k",
             "-movflags", "+faststart", saida.replace(".mp4", "-leve.mp4")])
        rel["saidas"].append(saida)
    run(["ffmpeg", "-v", "error", "-y", "-ss", "1.0", "-i", rel["saidas"][0], "-frames:v", "1", "-q:v", "3", os.path.join(out, "capa.jpg")])
    legenda = meta.get("legenda", "")
    with open(os.path.join(out, "legenda-C.txt"), "w", encoding="utf-8") as fh:
        fh.write(legenda)
    if feltros:  # versões com IA: a legenda do post também avisa
        with open(os.path.join(out, "legenda-feltro.txt"), "w", encoding="utf-8") as fh:
            fh.write((legenda + "\n\n" if legenda else "") + "Versão em feltro feita com IA a partir da minha gravação. A voz é minha.")
    return rel


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--entrada", nargs="+", required=True)
    ap.add_argument("--lote", required=True)
    ap.add_argument("--motor", choices=["nenhum", "runway"], default="nenhum")
    ap.add_argument("--mestra", default=os.path.join(PUBLIC, "feltro", "mestra.png"))
    ap.add_argument("--teto-usd", type=float, default=10.0)
    ap.add_argument("--stop-motion", action="store_true")
    ap.add_argument("--roteiro", help="força este roteiro (ex.: gravação sem claquete, roteiro escrito depois a partir da fala)")
    ap.add_argument("--python-asr", default=sys.executable)
    ap.add_argument("--modelo-asr", default="/opt/asr/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8")
    ap.add_argument("--navegador", default=os.environ.get("REMOTION_BROWSER", "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell"))
    args = ap.parse_args()
    if args.motor == "runway" and not os.path.exists(args.mestra):
        raise SystemExit(f"falta a imagem-mestra da Bárbara de feltro: {args.mestra}")

    videos = []
    for e in args.entrada:
        if os.path.isdir(e):
            videos += [os.path.join(e, f) for f in sorted(os.listdir(e)) if f.lower().endswith(VIDEO_EXT)]
        elif e.lower().endswith(VIDEO_EXT):
            videos.append(e)
    lote_pub = os.path.join(PUBLIC, "lotes", args.lote)
    lote_out = os.path.join(RAIZ, "out", "lotes", args.lote)
    os.makedirs(lote_out, exist_ok=True)
    gasto = {"creditos": 0}
    relatorio = {"lote": args.lote, "motor": args.motor, "videos": []}
    for v in videos:
        try:
            r = processar(args, v, lote_pub, lote_out, gasto)
        except Exception as e:  # um vídeo com problema não derruba o lote
            r = {"video": v, "erro": f"{type(e).__name__}: {e}"}
        relatorio["videos"].append(r)
        relatorio["gasto_usd"] = round(gasto["creditos"] / 100, 2)
        with open(os.path.join(lote_out, "relatorio.json"), "w", encoding="utf-8") as fh:
            json.dump(relatorio, fh, ensure_ascii=False, indent=1)
        print(f"{'ERRO' if 'erro' in r else 'ok'} {v}: {r.get('erro') or ', '.join(os.path.basename(s) for s in r['saidas'])}")
    shutil.rmtree(lote_pub, ignore_errors=True) if os.environ.get("ROCCO_LIMPAR") else None
    print(f"relatório: {os.path.join(lote_out, 'relatorio.json')} · gasto US$ {relatorio.get('gasto_usd', 0)}")


if __name__ == "__main__":
    main()
