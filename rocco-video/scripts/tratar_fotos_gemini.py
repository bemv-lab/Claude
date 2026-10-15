"""Deixa as fotos de produto com cara de foto profissional no Gemini (Nano Banana), sem mudar o produto.

Regra de ouro da marca: o tratamento NUNCA muda o produto (formas, cores, peças, letras, números,
posições, quantidade). Só muda a fotografia: fundo, luz, nitidez e cor fiel. Mesmo com um pedido
explícito, o Gemini às vezes "conserta" ou redesenha o produto. Por isso, cada variante é conferida
antes de ir para o vídeo.

Subcomandos:
  gerar     Para cada foto original, pede N variantes ao Gemini, um pedido por variante, e grava em
            <pasta da foto>/tratadas/gemini/<nome>-<k>.png. Depois monta a folha comparar-<nome>.jpg
            (original | variante 1 | variante 2 ...) e roda uma checagem LOCAL de fidelidade (grátis).
            A checagem recorta o produto no original e na variante (ISNet de recortar_fundo.py),
            alinha pelas caixas e mede:
              IoU     sobreposição das silhuetas (forma, proporção, peças sobrando ou faltando na borda);
              ΔE      diferença de cor em Lab dentro do produto: a bruta e a % da área que ainda difere
                      depois de compensar a luz geral (peça que mudou de cor);
              bloco   ΔE do pior bloco pequeno do produto, também depois de compensar a luz (uma peça
                      que mudou de cor ou sumiu). O bloco fica marcado na folha, para olhar ali primeiro;
              bordas  correlação dos mapas de gradiente (letras, costuras e peças no mesmo lugar).
            Marca "conferir" quando algum número passa do limite. A checagem não é trava nem aprovação:
            os limites são iniciais, e uma troca pequena (uma letra, um número, um botão) quase não mexe
            nos números.
            A decisão final é visual: o Claude abre a folha e compara original e variante peça por peça
            (letras, números, zíperes, botões, fivelas, cadarços, relógio, alças, formas de feltro,
            cores, posições, quantidade). Se qualquer coisa do produto mudou, a variante é descartada.
  promover  Recorta o fundo da variante aprovada (mesmo ISNet, sem nitidez extra) e grava
            <pasta do produto>/tratadas/<nome>.png, o arquivo que a fábrica usa (processar_lote.py,
            resolver_midia). O recorte local anterior é guardado em tratadas/recorte-local/<nome>.png.
            Variante simulada é recusada (só passa com --permitir-simulada, para testar numa cópia).
            Prévia para a Bárbara: tratadas/previa-gemini-<nome>.jpg (original | final sobre o creme).

Custo (US$ por imagem; preços do Google Cloud de 15/10/2026):
  gemini-3-pro-image (padrão, o mais forte em detalhe e texto): US$ 0,134 em 1K ou 2K e 0,24 em 4K.
      O thinking é cobrado à parte, então o teto conta US$ 0,25 por pedido em 1K ou 2K.
  gemini-3.1-flash-image: 0,045 (512) / 0,067 (1K) / 0,101 (2K) / 0,151 (4K).
  gemini-2.5-flash-image: 0,039 (só ~1K; não aceita --tamanho).
  Para um modelo fora da tabela, informe --usd-por-imagem.
  Idempotente: cada variante fica no --estado (sha256 da foto + modelo + versão do prompt + variante
  + tamanho). Rodar de novo não paga o que já existe. Teto: se o que está no estado mais o próximo
  pedido passar de --teto-usd, o script para antes de pedir. O teto vale para tudo o que o estado
  já registrou, como no feltro_runway.py. Erro HTTP 400 ou 500 do Google não é cobrado (FAQ de
  billing do Gemini). Uma resposta sem imagem (recusa ou bloqueio) fica registrada e conta no teto pelo
  usageMetadata, porque a cobrança nesse caso não está confirmada. Cada pedido já entra no estado
  como "pendente", com o valor orçado, ANTES de sair: se o processo morrer no meio (Ctrl-C, sessão
  encerrada), o teto continua certo e nada é pedido de novo sem --repetir-falhas. Resposta perdida
  (timeout, conexão caída, 502/504 do proxy) também conta o valor orçado; na segunda, a rodada para.

Autenticação: se existir GEMINI_API_KEY, ela vai no cabeçalho x-goog-api-key. Sem a variável, o
pedido sai sem chave e o proxy do ambiente injeta o "segredo de rede" (site
generativelanguage.googleapis.com, cabeçalho x-goog-api-key SEM o prefixo Bearer). Segredo de rede
só vale em sessão nova.

Dependências: numpy, pillow, onnxruntime (as mesmas do recortar_fundo.py).

Uso:
  python3 -I scripts/tratar_fotos_gemini.py gerar public/produto/pasta-de-descobertas/{aberta,fechada}.jpg \
      [--variantes 2] [--tamanho 2K] [--teto-usd 2.0] [--modelo gemini-3-pro-image] \
      [--descricao "peças, cores e textos do produto"] [--saida DIR] [--estado ARQ] [--simular]
  python3 -I scripts/tratar_fotos_gemini.py promover \
      public/produto/pasta-de-descobertas/tratadas/gemini/aberta-2.png [--nome aberta] [--pasta-produto DIR]

--simular não chama a API. A "variante" é a própria foto com mais brilho e o fundo clareado, para
testar o resto do fluxo (estado, folha, checagem, promover) sem gastar.
"""
import argparse
import base64
import datetime
import hashlib
import http.client
import importlib.util
import io
import json
import math
import os
import re
import shutil
import socket
import time
import urllib.error
import urllib.request

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

AQUI = os.path.dirname(os.path.abspath(__file__))
URL = "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent"
TIMEOUT = 300  # o Pro "pensa" antes de desenhar; 2K costuma levar de 20 a 90 s
CREME = (247, 244, 238)  # #F7F4EE, o mesmo do recortar_fundo.py
ISNET_PADRAO = os.path.expanduser("~/.cache/rocco/isnet-general-use.onnx")

MODELO_PADRAO = "gemini-3-pro-image"
# US$ por 1M de tokens (entrada; saída de imagem; saída de texto e thinking) e, por tamanho, o valor
# que conta no teto em cada pedido: o preço da imagem mais uma folga para o thinking.
# A folga vem de relatos de até US$ 0,23 por imagem no Pro.
PRECOS = {
    "gemini-3-pro-image": {"entrada": 2.0, "imagem": 120.0, "texto": 12.0, "pedido": {"1K": 0.25, "2K": 0.25, "4K": 0.36}},
    "gemini-3.1-flash-image": {"entrada": 0.5, "imagem": 60.0, "texto": 3.0, "pedido": {"512": 0.06, "1K": 0.08, "2K": 0.12, "4K": 0.17}},
    # sem thinking; o briefing não dá o preço do texto de saída, então ele é cobrado como imagem (a favor do teto)
    "gemini-2.5-flash-image": {"entrada": 0.3, "imagem": 30.0, "texto": 30.0, "pedido": {None: 0.045}},
}
PRECOS["gemini-3-pro-image-preview"] = PRECOS["gemini-3-pro-image"]
PRECOS["gemini-3.1-flash-image-preview"] = PRECOS["gemini-3.1-flash-image"]
SEM_TAMANHO = {"gemini-2.5-flash-image"}  # imageSize dá erro 400 nesse modelo
TAMANHOS = ["512", "1K", "2K", "4K"]
PROPORCOES = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"]
PROPORCOES_EXTRA = ["1:4", "4:1", "1:8", "8:1"]  # confirmadas só no 3.1 Flash Image
MIME_EXT = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}
MIME_DO_FORMATO = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}

# Limites iniciais da checagem local, a calibrar com as primeiras variantes reais.
LIMITE_IOU = 0.90
LIMITE_PROPORCAO = 0.06  # diferença relativa na proporção da caixa do produto
LIMITE_DE_MEDIO = 12.0  # ΔE76 médio: a cor geral mudou bastante
LIMITE_DE_LOCAL = 20.0  # ΔE76 de um pixel, depois de compensar a luz geral
LIMITE_AREA_LOCAL = 8.0  # % do produto acima de LIMITE_DE_LOCAL
LIMITE_BORDAS = 0.55
LIMITE_BLOCO = 25.0  # ΔE76 médio no pior bloco (~1/16 do lado): uma peça que mudou de cor ou sumiu

PROMPT_VERSAO = "2026-10-15b"
PROMPT = """Re-photograph the exact product shown in the attached photo as a professional e-commerce studio product photograph.

Keep the product 100% identical to the photo. Be exact about what stays the same: the same overall shape and proportions; the same colors; every piece exactly as it is (every letter, number, zipper, button, buckle, strap, shoelace, clock hand, handle, loop and felt shape that appears in the photo); the same positions, the same quantity of pieces, the same orientation, seen from the same camera viewpoint and angle as the reference photo. Every printed letter, number and word stays exactly as printed, with the same spelling, color, size and placement. Treat the product as a fixed reference that is reproduced faithfully, detail by detail. Do not add, remove, move, resize, redraw, simplify, straighten, tidy up or "fix" anything on the product, even if something looks crooked, worn or asymmetric. Add no text, no logo, no watermark, no props and no hands.

Change only the photography:
- background: a seamless, smooth, warm cream studio backdrop (#F7F4EE), evenly lit, filling the whole frame;
- lighting: soft, diffused light from a large softbox at the upper left, with gentle fill light, so the whole product is evenly lit without harsh highlights;
- a soft, natural contact shadow directly under the product;
- true-to-life colors with neutral white balance, without any color cast;
- crisp focus across the entire product, showing the real texture of the materials it is actually made of (for example felt, fabric, stitching and edge binding, only where they appear in the photo);
- a clean result: free of dust, lint, glare, reflections and noise.
Framing: keep the framing of the reference photo, with the product at the same size and position in the frame. If a part of the product (a strap, a handle, a corner) is cut off by the edge of the reference photo, it stays cut off at exactly the same place: never extend, complete or invent any part of the product that is not visible in the reference photo.
Style: photorealistic, high-resolution commercial product photograph."""

_rf = None
_sessao = None
_alfas = {}


# ---------------------------------------------------------------- recorte (ISNet do recortar_fundo.py)

def recortar_fundo():
    """Importa scripts/recortar_fundo.py pelo caminho: com python3 -I, a pasta do script não entra no sys.path."""
    global _rf
    if _rf is None:
        spec = importlib.util.spec_from_file_location("recortar_fundo", os.path.join(AQUI, "recortar_fundo.py"))
        _rf = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(_rf)
    return _rf


def alfa_produto(img, isnet, chave=None):
    """Máscara do produto (0 a 1), com a mesma limpeza do recortar_fundo.recortar."""
    if chave in _alfas:
        return _alfas[chave]
    global _sessao
    rf = recortar_fundo()
    if _sessao is None:
        _sessao = rf.ort.InferenceSession(rf.baixar_modelo(isnet), providers=["CPUExecutionProvider"])
    a = np.asarray(rf.mascara(_sessao, img), dtype=np.float64) / 255
    a = np.clip((a - 0.08) / 0.84, 0, 1)
    if chave is not None:
        _alfas[chave] = a
    return a


def caixa_produto(alfa):
    ys, xs = np.nonzero(alfa > 0.5)
    if not len(xs):
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


# ---------------------------------------------------------------- utilidades

def tem_alfa(im):
    return im.mode in ("RGBA", "LA", "PA", "RGBa", "La") or (im.mode == "P" and "transparency" in im.info)


def achatar(im):
    """RGB de verdade: gira pelo EXIF e, se houver transparência, assenta sobre o creme (sob o transparente
    pode haver preto ou lixo, que confundiria o recorte, a checagem e o Gemini)."""
    im = ImageOps.exif_transpose(im)
    if tem_alfa(im):
        rgba = im.convert("RGBA")
        fundo = Image.new("RGB", rgba.size, CREME)
        fundo.paste(rgba, (0, 0), rgba)
        return fundo
    return im.convert("RGB")


def abrir(caminho):
    with Image.open(caminho) as im:
        im.load()  # decodifica tudo agora: arquivo truncado falha aqui, com o nome do arquivo
        return achatar(im)


def localizar(arquivo, estado):
    """Caminho atual de um arquivo registrado no estado. O estado guarda caminho absoluto; se a pasta mudou
    de lugar (outra cópia do repositório), procura o mesmo nome ao lado do estado em vez de pagar de novo."""
    if not arquivo:
        return None
    if os.path.exists(arquivo):
        return arquivo
    vizinho = os.path.join(os.path.dirname(os.path.abspath(estado)), os.path.basename(arquivo))
    return vizinho if os.path.exists(vizinho) else None


def sha256(caminho):
    h = hashlib.sha256()
    with open(caminho, "rb") as fh:
        for bloco in iter(lambda: fh.read(1 << 20), b""):
            h.update(bloco)
    return h.hexdigest()


def br(x, casas=2):
    return f"{x:.{casas}f}".replace(".", ",")


def agora():
    return datetime.datetime.now().astimezone().isoformat(timespec="seconds")


def carregar(estado):
    if os.path.exists(estado):
        with open(estado, encoding="utf-8") as fh:
            return json.load(fh)
    return {"variantes": {}}


def salvar(estado, dados):
    os.makedirs(os.path.dirname(os.path.abspath(estado)), exist_ok=True)
    tmp = estado + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(dados, fh, ensure_ascii=False, indent=1)
    os.replace(tmp, estado)


def gasto(dados):
    """US$ que contam no teto: tudo o que o estado registrou como possivelmente cobrado (simulações não contam)."""
    return sum(v.get("custo_usd", 0) for v in dados["variantes"].values() if not v.get("simulado"))


def proporcao_mais_proxima(largura, altura, modelo):
    opcoes = PROPORCOES + (PROPORCOES_EXTRA if modelo.startswith("gemini-3.1-flash-image") else [])
    alvo = math.log(largura / altura)

    def dist(p):
        a, b = p.split(":")
        return abs(math.log(int(a) / int(b)) - alvo)

    return min(opcoes, key=dist)


def foto_para_envio(caminho):
    """Manda o arquivo original como está. Só reprocessa se tiver rotação EXIF, transparência, cor fora de
    RGB (CMYK, 16 bits...), formato estranho ou mais de 7 MB. Transparência vai assentada sobre o creme."""
    with open(caminho, "rb") as fh:
        bruto = fh.read()
    im = Image.open(io.BytesIO(bruto))
    formato = (im.format or "").upper()
    rotacao = im.getexif().get(0x0112, 1)
    if (formato in MIME_DO_FORMATO and rotacao == 1 and len(bruto) <= 7_000_000
            and im.mode in ("RGB", "L") and not tem_alfa(im)):
        return bruto, MIME_DO_FORMATO[formato]
    im.load()
    im = achatar(im)
    im.thumbnail((3072, 3072), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    if formato in ("PNG", "WEBP"):  # sem perda, como o original
        im.save(buf, "PNG", optimize=True)
        if buf.tell() <= 7_000_000:
            return buf.getvalue(), "image/png"
        buf = io.BytesIO()
    im.save(buf, "JPEG", quality=95)
    return buf.getvalue(), "image/jpeg"


def montar_pedido(foto_bytes, mime, prompt, proporcao, tamanho):
    config = {}
    if proporcao:
        config["aspectRatio"] = proporcao
    if tamanho:
        config["imageSize"] = tamanho
    corpo = {
        "contents": [{"role": "user", "parts": [
            {"text": prompt},
            {"inline_data": {"mime_type": mime, "data": base64.b64encode(foto_bytes).decode()}},
        ]}],
        "generationConfig": {"responseModalities": ["IMAGE"]},
    }
    if config:
        corpo["generationConfig"]["imageConfig"] = config
    return corpo


# ---------------------------------------------------------------- chamada à API

class ErroHTTP(Exception):
    def __init__(self, codigo, corpo):
        super().__init__(codigo)
        if isinstance(corpo, list) and corpo and isinstance(corpo[0], dict):  # alguns erros do Google vêm em lista
            corpo = corpo[0]
        self.codigo = codigo
        self.corpo = corpo
        erro = corpo.get("error", {}) if isinstance(corpo, dict) else {}
        self.status = erro.get("status", "")
        self.mensagem = erro.get("message", "") or (corpo.get("_bruto", "") if isinstance(corpo, dict) else "")


    @property
    def do_google(self):
        """O corpo é o JSON de erro do Google ({"error": {...}}). Sem isso, o erro veio de um intermediário (proxy)."""
        return isinstance(self.corpo, dict) and isinstance(self.corpo.get("error"), dict)


class SemResposta(Exception):
    """O pedido saiu, mas a resposta não chegou inteira. Pode ter sido cobrado."""


class NadaEnviado(Exception):
    """A conexão falhou antes de o pedido chegar ao Gemini. Nada foi cobrado."""


def ler_erro(e):
    try:
        bruto = e.read().decode("utf-8", "replace")
    except Exception:
        return {}
    try:
        return json.loads(bruto)
    except ValueError:
        return {"_bruto": bruto[:300]}


def espera_sugerida(corpo, padrao):
    for d in (corpo.get("error", {}) if isinstance(corpo, dict) else {}).get("details", []) or []:
        atraso = d.get("retryDelay") if isinstance(d, dict) else None
        if atraso:
            try:
                return min(30.0, float(str(atraso).rstrip("s")))
            except ValueError:
                pass
    return padrao


def cabecalhos():
    h = {"Content-Type": "application/json"}
    chave = os.environ.get("GEMINI_API_KEY")
    if chave:
        h["x-goog-api-key"] = chave
    return h


def pedir(modelo, corpo):
    """POST generateContent. Repete só 429, 500 e 503 vindos do próprio Google (no máximo 3 vezes, com backoff
    curto): erro do Google não é cobrado. Nunca repete depois de uma resposta 200 (uma resposta com imagem já
    foi cobrada) nem depois de um 5xx de intermediário (502/504 do proxy: o Google pode ter terminado e cobrado)."""
    dados = json.dumps(corpo).encode()
    for tentativa in range(4):
        req = urllib.request.Request(URL.format(modelo), data=dados, method="POST", headers=cabecalhos())
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                bruto = r.read()
            try:
                resp = json.loads(bruto)
            except ValueError as e:
                raise SemResposta(f"resposta 200 ilegível ({len(bruto)} bytes)") from e
            if not isinstance(resp, dict):
                raise SemResposta(f"resposta 200 fora do formato ({type(resp).__name__})")
            return resp
        except urllib.error.HTTPError as e:
            erro = ErroHTTP(e.code, ler_erro(e))
            if e.code >= 500 and not erro.do_google:
                raise SemResposta(f"HTTP {e.code} de um intermediário, não do Gemini "
                                  f"({erro.mensagem[:120] or 'sem corpo'}); o Gemini pode ter gerado e cobrado") from None
            if e.code in (429, 500, 503) and tentativa < 3:
                espera = espera_sugerida(erro.corpo, 2.0 * 2 ** tentativa)
                print(f"    HTTP {e.code} {erro.status}: nova tentativa em {espera:.0f} s")
                time.sleep(espera)
                continue
            raise erro from None
        except urllib.error.URLError as e:
            if isinstance(e.reason, (TimeoutError, socket.timeout)):
                raise SemResposta(f"tempo esgotado ({TIMEOUT} s)") from None
            motivo = str(e.reason)
            if "Tunnel connection failed" in motivo or "403" in motivo or "407" in motivo:
                raise NadaEnviado(
                    f"o proxy do ambiente recusou a conexão com generativelanguage.googleapis.com ({motivo}).\n"
                    "Libere o host em \"Acesso à rede\" do ambiente e abra uma sessão nova. Nada foi enviado nem cobrado."
                ) from None
            raise NadaEnviado(f"sem conexão com o Gemini: {motivo}. Nada foi cobrado.") from None
        except (OSError, http.client.HTTPException) as e:  # timeout, conexão resetada, SSL no meio da resposta...
            raise SemResposta(f"conexão caiu durante a resposta ({type(e).__name__}: {e})") from None
    raise AssertionError("inalcançável")


MSG_AUTENTICACAO = """o Gemini recusou a autenticação (HTTP {codigo} {status}). Nada foi cobrado: erro HTTP não é cobrado.
  - GEMINI_API_KEY {tem_chave} nesta sessão. Sem a variável, a chave precisa vir do "segredo de rede" do
    ambiente (site generativelanguage.googleapis.com), que o proxy injeta no pedido.
  - Segredo de rede só vale em sessão NOVA. Depois de cadastrar ou mudar o segredo, abra outra sessão.
  - O segredo do Gemini usa o cabeçalho x-goog-api-key, SEM o prefixo "Bearer". Com "Bearer", o Gemini recusa a chave.
  - Se a chave chegou e mesmo assim deu erro, a chave pode estar errada ou restrita, ou o projeto pode estar sem a
    Generative Language API ou sem faturamento ativo.
  Resposta do Gemini: {mensagem}"""


def tratar_erro_http(e):
    """Erros que não adianta repetir: param o script com uma explicação em português."""
    texto = json.dumps(e.corpo, ensure_ascii=False)
    if not e.do_google and e.codigo < 500:
        raise SystemExit(f"HTTP {e.codigo} que não veio do Gemini (o corpo não é o JSON de erro do Google): "
                         f"provavelmente o proxy do ambiente barrou o pedido (host fora de \"Acesso à rede\"?). "
                         f"Nada foi cobrado.\n  Resposta: {e.mensagem[:300] or '(sem corpo)'}")
    if e.codigo in (401, 403) or "API_KEY_INVALID" in texto or "API key not valid" in texto:
        raise SystemExit(MSG_AUTENTICACAO.format(
            codigo=e.codigo, status=e.status, mensagem=e.mensagem[:300] or "(sem corpo)",
            tem_chave="existe" if os.environ.get("GEMINI_API_KEY") else "NÃO existe"))
    if e.status == "FAILED_PRECONDITION":
        raise SystemExit(f"o Gemini recusou o pedido (HTTP {e.codigo} FAILED_PRECONDITION): faturamento não ativado "
                         f"ou free tier indisponível. Os modelos de imagem não têm free tier. Nada foi cobrado.\n  {e.mensagem}")
    if e.codigo == 404:
        raise SystemExit(f"modelo não encontrado (HTTP 404). O ID pode estar errado ou o modelo pode ter sido desligado. "
                         f"Troque --modelo. Nada foi cobrado.\n  {e.mensagem}")
    if e.codigo == 429:
        raise SystemExit(f"limite de uso do Gemini (HTTP 429 {e.status}) mesmo depois de 3 tentativas: cota, RPM/RPD ou teto "
                         f"de gasto do projeto. Tente mais tarde. O 429 não aparece no FAQ de cobrança; provavelmente não foi cobrado.\n  {e.mensagem}")
    if e.codigo >= 500:
        return f"Gemini fora do ar (HTTP {e.codigo} {e.status}) depois de 3 tentativas; não cobrado"
    raise SystemExit(f"o Gemini recusou o pedido (HTTP {e.codigo} {e.status}). Corrija antes de repetir. "
                     f"Nada foi cobrado.\n  {e.mensagem[:500]}")


def b64(texto):
    """base64 padrão; aceita também a variante URL-safe e sem padding (o JSON do Google aceita as duas)."""
    texto = re.sub(r"\s", "", texto)
    texto += "=" * (-len(texto) % 4)
    if "-" in texto or "_" in texto:
        return base64.urlsafe_b64decode(texto)
    return base64.b64decode(texto, validate=True)


def ler_resposta(resp):
    """-> (imagens [(mime, bytes)], info). Ignora as partes de "pensamento" (thought: true), a não ser que
    só venha imagem de pensamento: aí usa a última (é a final, segundo a doc do Pro), porque já foi paga.
    Nunca levanta exceção com resposta fora do formato: vira "sem imagem" com o motivo."""
    info = {}
    try:
        for campo in ("modelVersion", "responseId"):
            if resp.get(campo):
                info[campo] = resp[campo]
        if resp.get("modelStatus"):
            info["modelStatus"] = resp["modelStatus"]
        bloqueio = (resp.get("promptFeedback") or {}).get("blockReason")
        if bloqueio:
            info["motivo"] = f"pedido bloqueado pelo Gemini: {bloqueio}"
            return [], info
        candidatos = resp.get("candidates") or []
        if not candidatos:
            info["motivo"] = "resposta sem candidates"
            return [], info
        c = candidatos[0]
        info["finishReason"] = c.get("finishReason")
        if c.get("finishMessage"):
            info["finishMessage"] = str(c["finishMessage"])[:500]
        imagens, pensamento, textos, ruins = [], [], [], 0
        for p in (c.get("content") or {}).get("parts") or []:
            if not isinstance(p, dict):
                continue
            dado = p.get("inlineData") or p.get("inline_data")
            if isinstance(dado, dict) and dado.get("data"):
                mime = dado.get("mimeType") or dado.get("mime_type") or "image/png"
                try:
                    (pensamento if p.get("thought") else imagens).append((mime, b64(dado["data"])))
                except (ValueError, TypeError):
                    ruins += 1
            elif p.get("text") and not p.get("thought"):
                textos.append(str(p["text"]))
        if textos:
            info["texto"] = " ".join(textos)[:500]
        if ruins:
            info["imagens_base64_invalido"] = ruins
        if not imagens and pensamento:
            imagens = pensamento[-1:]
            info["imagem_de_pensamento"] = True
        if not imagens:
            detalhe = f": {info['finishMessage']}" if info.get("finishMessage") else ""
            ruim = f"; {ruins} imagem(ns) com base64 inválido" if ruins else ""
            info["motivo"] = f"sem imagem (finishReason {c.get('finishReason')}{detalhe}{ruim})"
        return imagens, info
    except Exception as e:  # formato inesperado: registra (pode ter sido cobrado) em vez de cair sem estado
        info["motivo"] = f"resposta fora do formato esperado ({type(e).__name__}: {e})"[:300]
        return [], info


def custo_pelo_uso(preco, uso):
    """US$ pelo usageMetadata da resposta (o billing do Pro às vezes mostra um pouco mais)."""
    if not uso or not preco or not isinstance(uso, dict):
        return None
    try:
        entrada = int(uso.get("promptTokenCount", 0))
        saida = int(uso.get("candidatesTokenCount", 0))
        detalhes = uso.get("candidatesTokensDetails") or []
        imagem = sum(int(d.get("tokenCount", 0)) for d in detalhes if d.get("modality") == "IMAGE") if detalhes else saida
        texto = max(0, saida - imagem) + int(uso.get("thoughtsTokenCount", 0))
    except (TypeError, ValueError, AttributeError):
        return None
    return round((entrada * preco["entrada"] + imagem * preco["imagem"] + texto * preco["texto"]) / 1e6, 4)


# ---------------------------------------------------------------- checagem local de fidelidade

def rgb_para_lab(rgb):
    c = rgb / 255.0
    c = np.where(c > 0.04045, ((c + 0.055) / 1.055) ** 2.4, c / 12.92)
    m = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = c @ m.T / np.array([0.95047, 1.0, 1.08883])
    d = 6 / 29
    f = np.where(xyz > d ** 3, np.cbrt(xyz), xyz / (3 * d * d) + 4 / 29)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], axis=-1)


def gradiente(lum):
    gx = np.zeros_like(lum)
    gy = np.zeros_like(lum)
    gx[:, 1:-1] = lum[:, 2:] - lum[:, :-2]
    gy[1:-1, :] = lum[2:, :] - lum[:-2, :]
    return np.hypot(gx, gy)


def checar(img_o, alfa_o, img_v, alfa_v, lado=384):
    """Compara o produto do original com o da variante, alinhados pelas caixas do produto. Grátis e local."""
    co, cv = caixa_produto(alfa_o), caixa_produto(alfa_v)
    if co is None or cv is None:
        return {"conferir": True, "motivos": ["não achei o produto no " + ("original" if co is None else "resultado")]}
    wo, ho = co[2] - co[0], co[3] - co[1]
    wv, hv = cv[2] - cv[0], cv[3] - cv[1]
    esc = lado / max(wo, ho)
    tam = (max(16, round(wo * esc)), max(16, round(ho * esc)))

    def normalizar(img, alfa, caixa):
        im = img.crop(caixa).resize(tam, Image.Resampling.LANCZOS)
        m = Image.fromarray((alfa * 255).astype(np.uint8), mode="L").crop(caixa).resize(tam, Image.Resampling.BILINEAR)
        return im, m

    im_o, m_o = normalizar(img_o, alfa_o, co)
    im_v, m_v = normalizar(img_v, alfa_v, cv)
    bo, bv = np.asarray(m_o) > 127, np.asarray(m_v) > 127
    iou = float((bo & bv).sum() / max((bo | bv).sum(), 1))
    # cor: versões levemente borradas, para tolerar desalinhamento de 1 ou 2 px; sem a borda do recorte
    dentro = np.asarray(Image.fromarray(((bo & bv) * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(7))) > 127
    if dentro.sum() < 50:
        dentro = bo & bv
    lab_o = rgb_para_lab(np.asarray(im_o.filter(ImageFilter.GaussianBlur(1.5)), dtype=np.float64))
    lab_v = rgb_para_lab(np.asarray(im_v.filter(ImageFilter.GaussianBlur(1.5)), dtype=np.float64))
    de = np.linalg.norm(lab_o - lab_v, axis=-1)[dentro]
    compensada = lab_v - lab_v[dentro].mean(axis=0) + lab_o[dentro].mean(axis=0)
    de_local = np.linalg.norm(lab_o - compensada, axis=-1)[dentro]
    # bordas: correlação dos gradientes de luminância na região do produto
    uniao = np.asarray(Image.fromarray(((bo | bv) * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))) > 127
    go, gv = gradiente(lab_o[..., 0])[uniao], gradiente(lab_v[..., 0])[uniao]
    bordas = float(np.corrcoef(go, gv)[0, 1]) if go.std() > 1e-6 and gv.std() > 1e-6 else 0.0
    # pior bloco: média do ΔE compensado em janelas pequenas, sobre versões mais borradas (peça inteira que
    # mudou de cor ou sumiu aparece; desalinhamento de poucos px quase não)
    lab_o3 = rgb_para_lab(np.asarray(im_o.filter(ImageFilter.GaussianBlur(3)), dtype=np.float64))
    lab_v3 = rgb_para_lab(np.asarray(im_v.filter(ImageFilter.GaussianBlur(3)), dtype=np.float64))
    mapa = np.linalg.norm(lab_o3 - (lab_v3 - lab_v3[dentro].mean(axis=0) + lab_o3[dentro].mean(axis=0)), axis=-1)
    passo = max(8, lado // 16)
    pior, onde = 0.0, None
    for y in range(0, tam[1] - passo + 1, passo // 2):
        for x in range(0, tam[0] - passo + 1, passo // 2):
            m = dentro[y:y + passo, x:x + passo]
            if m.mean() >= 0.5:
                val = float(mapa[y:y + passo, x:x + passo][m].mean())
                if val > pior:
                    pior, onde = val, (x, y)

    def na_foto(caixa):  # janela do quadro normalizado -> pixels da foto
        x, y = onde
        sx, sy = (caixa[2] - caixa[0]) / tam[0], (caixa[3] - caixa[1]) / tam[1]
        return [round(caixa[0] + x * sx), round(caixa[1] + y * sy), round(caixa[0] + (x + passo) * sx), round(caixa[1] + (y + passo) * sy)]

    proporcao = (wv / hv) / (wo / ho)
    r = {
        "iou": round(iou, 3),
        "de_medio": round(float(de.mean()), 2),
        "de_p90": round(float(np.percentile(de, 90)), 2),
        "area_cor_diferente_pct": round(float((de_local > LIMITE_DE_LOCAL).mean() * 100), 1),
        "bordas": round(bordas, 3),
        "pior_bloco": round(pior, 1),
        "pior_bloco_original": na_foto(co) if onde else None,
        "pior_bloco_variante": na_foto(cv) if onde else None,
        "proporcao_caixa": round(float(proporcao), 3),
        "caixa_original": list(co),
        "caixa_variante": list(cv),
    }
    motivos = []
    if iou < LIMITE_IOU:
        motivos.append(f"silhueta diferente (IoU {br(iou)} < {br(LIMITE_IOU)})")
    if abs(proporcao - 1) > LIMITE_PROPORCAO:
        motivos.append(f"proporção do produto mudou {br((proporcao - 1) * 100, 0)}%")
    if r["de_medio"] > LIMITE_DE_MEDIO:
        motivos.append(f"cor geral mudou (ΔE médio {br(r['de_medio'], 1)})")
    if r["area_cor_diferente_pct"] > LIMITE_AREA_LOCAL:
        motivos.append(f"{br(r['area_cor_diferente_pct'], 1)}% do produto com cor diferente")
    if pior > LIMITE_BLOCO:
        motivos.append(f"um trecho do produto mudou de cor ou de peça (bloco com ΔE {br(pior, 1)}, marcado na folha)")
    if bordas < LIMITE_BORDAS:
        motivos.append(f"detalhes fora do lugar (bordas {br(bordas)})")
    r["conferir"] = bool(motivos)
    r["motivos"] = motivos
    return r


def resumo_checagem(c):
    if not c:
        return "sem checagem"
    if "iou" not in c:
        return "CONFERIR: " + "; ".join(c.get("motivos", []))
    base = (f"IoU {br(c['iou'])} · ΔE {br(c['de_medio'], 1)} · cor dif. {br(c['area_cor_diferente_pct'], 1)}% · "
            f"bloco {br(c.get('pior_bloco', 0), 1)} · bordas {br(c['bordas'])}")
    return base + (" · CONFERIR: " + "; ".join(c["motivos"]) if c["conferir"] else " · ok nos números")


# ---------------------------------------------------------------- folha de comparação

def fonte(tamanho):
    for f in ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"):
        if os.path.exists(f):
            return ImageFont.truetype(f, tamanho)
    return ImageFont.load_default(size=tamanho)


def quebrar(texto, f, largura, draw):
    linhas, atual = [], ""
    for palavra in texto.split(" "):
        teste = (atual + " " + palavra).strip()
        if draw.textlength(teste, font=f) <= largura or not atual:
            atual = teste
        else:
            linhas.append(atual)
            atual = palavra
    return linhas + ([atual] if atual else [])


def folha(caminho, paineis, altura=900):
    """paineis: [(título, texto, cor, Image ou None, caixas a marcar)]. Mesma altura para todos, rótulos embaixo."""
    f_tit, f_txt = fonte(34), fonte(26)
    ref = next(p[3] for p in paineis if p[3] is not None)
    larg_padrao = round(ref.width * altura / ref.height)
    imgs = []
    for _, _, _, im, _ in paineis:
        if im is None:
            imgs.append(Image.new("RGB", (larg_padrao, altura), (225, 225, 225)))
        else:
            imgs.append(im.resize((round(im.width * altura / im.height), altura), Image.Resampling.LANCZOS))
    esboco = ImageDraw.Draw(Image.new("RGB", (8, 8)))
    textos = [quebrar(p[1], f_txt, im.width - 24, esboco) for p, im in zip(paineis, imgs)]
    faixa = 66 + 34 * max(len(t) for t in textos)
    margem = 16
    largura = sum(im.width for im in imgs) + margem * (len(imgs) + 1)
    out = Image.new("RGB", (largura, altura + faixa + 2 * margem), (255, 255, 255))
    d = ImageDraw.Draw(out)
    x = margem
    for (titulo, _, cor, original, marcas), im, linhas in zip(paineis, imgs, textos):
        out.paste(im, (x, margem))
        for caixa in marcas or []:
            e = altura / original.height
            d.rectangle([x + caixa[0] * e - 4, margem + caixa[1] * e - 4, x + caixa[2] * e + 4, margem + caixa[3] * e + 4],
                        outline=(255, 120, 0), width=5)
        if original is None:
            d.text((x + 20, margem + altura // 2 - 15), "sem imagem", font=f_tit, fill=(120, 120, 120))
        d.text((x + 12, margem + altura + 12), titulo, font=f_tit, fill=cor)
        for i, linha in enumerate(linhas):
            d.text((x + 12, margem + altura + 60 + 34 * i), linha, font=f_txt, fill=(60, 60, 60))
        x += im.width + margem
    out.save(caminho, quality=88)
    return caminho


# ---------------------------------------------------------------- gerar

def variante_simulada(img, alfa, k):
    """Imita uma "foto tratada" sem chamar a API: produto um pouco mais claro e fundo clareado para o creme."""
    base = np.asarray(img, dtype=np.float64)
    a = alfa[..., None]
    produto = np.clip(base * (1 + 0.04 * k) + (np.array([3.0, 0.0, -3.0]) if k % 2 == 0 else 0), 0, 255)
    fundo = 0.25 * base + 0.75 * np.array(CREME, dtype=np.float64)
    return Image.fromarray((a * produto + (1 - a) * fundo).round().astype(np.uint8), mode="RGB")


def arquivo_livre(saida, nome, k, sufixo, usados):
    """<nome>-<k><sufixo>, ou o próximo número livre se esse já pertence a outra variante (outro modelo, por exemplo)."""
    n = k
    while True:
        base = os.path.join(saida, f"{nome}-{n}{sufixo}")
        if not any(os.path.exists(base + ext) or (base + ext) in usados for ext in MIME_EXT.values()):
            return base
        n += 1


def gerar(args):
    modelo = args.modelo
    preco = PRECOS.get(modelo)
    if preco is None and args.usd_por_imagem is None:
        raise SystemExit(f"não sei o preço de {modelo}. Informe --usd-por-imagem (US$ por pedido) para o teto funcionar.")
    tamanho = args.tamanho
    if modelo in SEM_TAMANHO:
        if tamanho:
            print(f"aviso: {modelo} não aceita imageSize (sai ~1K); --tamanho {tamanho} ignorado")
        tamanho = None
    elif (tamanho := tamanho or "2K") not in TAMANHOS:
        raise SystemExit(f"--tamanho deve ser um destes: {', '.join(TAMANHOS)} (com K maiúsculo)")
    elif preco and tamanho not in preco["pedido"]:
        raise SystemExit(f"{modelo} não gera em {tamanho}. Tamanhos: {', '.join(k for k in preco['pedido'] if k)}")
    estimado = args.usd_por_imagem if args.usd_por_imagem is not None else preco["pedido"][tamanho]
    prompt = PROMPT + (f"\n\nProduct details that must stay exactly the same: {args.descricao.strip()}" if args.descricao else "")
    if args.variantes < 1:
        raise SystemExit("--variantes precisa ser 1 ou mais")

    fotos = []
    for f in args.fotos:
        if not os.path.isfile(f):
            raise SystemExit(f"foto não encontrada: {f}")
        caminho = os.path.abspath(f)
        saida = os.path.abspath(args.saida) if args.saida else os.path.join(os.path.dirname(caminho), "tratadas", "gemini")
        estado = os.path.abspath(args.estado) if args.estado else os.path.join(saida, "estado-gemini.json")
        fotos.append((caminho, saida, estado))
    estados = {e: carregar(e) for _, _, e in fotos}

    def gasto_total():
        return sum(gasto(d) for d in estados.values())

    sufixo_sim = "-simulada" if args.simular else ""
    print(f"modelo {modelo} · tamanho {tamanho or '~1K'} · prompt {PROMPT_VERSAO} · {args.variantes} variante(s) por foto"
          + (" · SIMULAÇÃO (não chama a API)" if args.simular else ""))
    print(f"teto US$ {br(args.teto_usd)} · já registrado no estado US$ {br(gasto_total(), 3)} · cada pedido conta US$ {br(estimado, 3)}")

    avisos, parou, novos_usd, uso_usd, sem_resposta = [], False, 0.0, 0.0, 0
    for caminho, saida, estado in fotos:
        if parou:
            break
        os.makedirs(saida, exist_ok=True)
        dados = estados[estado]
        nome = os.path.splitext(os.path.basename(caminho))[0]
        img = abrir(caminho)
        sha = sha256(caminho)
        proporcao = None if args.proporcao == "omitir" else (
            proporcao_mais_proxima(img.width, img.height, modelo) if args.proporcao == "auto" else args.proporcao)
        print(f"\n{nome} ({img.width}x{img.height}, aspectRatio {proporcao or 'livre'})")
        foto_bytes = mime = None
        chaves = []
        for k in range(1, args.variantes + 1):
            chave = f"{sha}|{modelo}|{PROMPT_VERSAO}|v{k}|{tamanho or 'fixo'}"
            if args.descricao:
                chave += "|d" + hashlib.sha256(args.descricao.strip().encode()).hexdigest()[:10]
            chave += f"|r{proporcao or 'livre'}"  # a proporção efetiva: "auto" e o mesmo valor explícito são o mesmo pedido
            if args.simular:
                chave += "|simulado"
            chaves.append(chave)
            v = dados["variantes"].get(chave)
            achado = localizar(v.get("arquivo"), estado) if v else None
            if v and v.get("status") == "ok" and achado:
                if achado != v["arquivo"]:  # a pasta mudou de lugar: atualiza o caminho em vez de pagar de novo
                    v["arquivo"] = achado
                    v["extras"] = [localizar(x, estado) or x for x in v.get("extras") or []]
                    salvar(estado, dados)
                print(f"  {k}: já existe ({os.path.basename(achado)}), sem pagar de novo")
                continue
            if v and v.get("status") != "ok":
                if not args.repetir_falhas:
                    print(f"  {k}: falhou antes ({v.get('motivo')}; conta US$ {br(v.get('custo_usd', 0), 3)} no teto); "
                          "use --repetir-falhas para tentar mais uma vez")
                    continue
                if v.get("tentativas", 1) >= 2:
                    print(f"  {k}: já falhou {v['tentativas']} vezes com este prompt ({v.get('motivo')}); não insisto")
                    continue
            if v and v.get("status") == "ok":
                print(f"  {k}: o arquivo {v.get('arquivo')} sumiu; vou gerar de novo")
            usados = {x.get("arquivo") for c, x in dados["variantes"].items() if c != chave and x.get("arquivo")}
            base = arquivo_livre(saida, nome, k, sufixo_sim, usados)

            if args.simular:
                arq = base + ".png"
                variante_simulada(img, alfa_produto(img, args.isnet, sha), k).save(arq)
                dados["variantes"][chave] = {
                    "foto": caminho, "sha256": sha, "modelo": modelo, "prompt_versao": PROMPT_VERSAO, "variante": k,
                    "tamanho": tamanho, "proporcao": proporcao, "status": "ok", "arquivo": arq, "simulado": True,
                    "custo_usd": 0, "quando": agora(),
                }
                salvar(estado, dados)
                print(f"  {k}: simulada -> {os.path.basename(arq)} (um pedido real contaria US$ {br(estimado, 3)})")
                continue

            if gasto_total() + estimado > args.teto_usd + 1e-9:
                print(f"  {k}: TETO: US$ {br(gasto_total(), 3)} registrados + US$ {br(estimado, 3)} deste pedido > "
                      f"US$ {br(args.teto_usd)}. Parei antes de pedir.")
                avisos.append(f"teto de US$ {br(args.teto_usd)} atingido; faltaram variantes")
                parou = True
                break
            if foto_bytes is None:
                foto_bytes, mime = foto_para_envio(caminho)
            corpo = montar_pedido(foto_bytes, mime, prompt, proporcao, tamanho)
            anterior = v or {}
            registro = {
                "foto": caminho, "sha256": sha, "modelo": modelo, "prompt_versao": PROMPT_VERSAO, "variante": k,
                "tamanho": tamanho, "proporcao": proporcao, "quando": agora(),
                "tentativas": anterior.get("tentativas", 0) + 1, "estimado_usd": estimado,
            }
            # Antes de pedir, o estado já conta o valor orçado. Se o processo morrer depois da cobrança (Ctrl-C,
            # sessão encerrada, disco cheio, resposta estranha), o teto continua certo e a próxima rodada não
            # pede de novo sem --repetir-falhas.
            dados["variantes"][chave] = dict(registro, status="pendente", custo_usd=anterior.get("custo_usd", 0) + estimado,
                                             motivo="pedido interrompido antes de gravar a resposta (pode ter sido cobrado)")
            salvar(estado, dados)

            def desfazer():  # o pedido certamente não foi cobrado: volta o estado como estava
                if v is None:
                    dados["variantes"].pop(chave, None)
                else:
                    dados["variantes"][chave] = v
                salvar(estado, dados)

            print(f"  {k}: pedindo ao Gemini...", flush=True)
            t0 = time.time()
            try:
                resp = pedir(modelo, corpo)
            except ErroHTTP as e:
                desfazer()
                msg = tratar_erro_http(e)  # para o script nos erros que não adianta repetir
                print(f"  {k}: {msg}")
                avisos.append(f"{nome} variante {k}: {msg}")
                continue
            except NadaEnviado as e:
                desfazer()
                raise SystemExit(str(e)) from None
            except SemResposta as e:
                # não se sabe se foi cobrado: conta o valor orçado no teto
                registro.update(status="sem_resposta", motivo=str(e), custo_usd=anterior.get("custo_usd", 0) + estimado)
                dados["variantes"][chave] = registro
                salvar(estado, dados)
                novos_usd += estimado
                sem_resposta += 1
                print(f"  {k}: {e}. Contei US$ {br(estimado, 3)} no teto por segurança.")
                avisos.append(f"{nome} variante {k}: {e}")
                if sem_resposta >= 2:  # padrão (timeout do proxy, rede caindo): cada pedido pode estar sendo cobrado
                    avisos.append("duas respostas perdidas nesta rodada; parei para não pagar por imagens que não chegam")
                    parou = True
                    break
                continue
            imagens, info = ler_resposta(resp)
            uso = resp.get("usageMetadata") if isinstance(resp.get("usageMetadata"), dict) else {}
            custo_uso = custo_pelo_uso(preco, uso)
            registro.update(info)
            registro["segundos"] = round(time.time() - t0, 1)
            registro["uso"] = {c: uso[c] for c in ("promptTokenCount", "candidatesTokenCount", "thoughtsTokenCount",
                                                   "totalTokenCount", "candidatesTokensDetails") if c in uso}
            registro["custo_uso_usd"] = custo_uso
            registro["imagens_na_resposta"] = len(imagens)
            estagio = (info.get("modelStatus") or {}).get("modelStage") if isinstance(info.get("modelStatus"), dict) else None
            if estagio and estagio not in ("STABLE", "GA", "PREVIEW"):
                avisos.append(f"{modelo} está como {estagio}: {(info.get('modelStatus') or {}).get('message', '')}")
            veio_imagem = len(imagens) + int(info.get("imagens_base64_invalido", 0))  # pagas, mesmo se ilegíveis
            if imagens:
                mime_saida, conteudo = imagens[-1]  # a última imagem não-pensamento é a final
                try:
                    with Image.open(io.BytesIO(conteudo)) as teste:
                        teste.load()  # decodifica tudo: verify() não pega JPEG truncado
                        mime_saida = MIME_DO_FORMATO.get((teste.format or "").upper(), mime_saida)
                except Exception as e:
                    registro["motivo"] = f"imagem ilegível na resposta ({type(e).__name__}: {e})"[:300]
                    try:  # guarda os bytes mesmo assim, para conferir à mão (foram pagos)
                        with open(base + "-ilegivel.bin", "wb") as fh:
                            fh.write(conteudo)
                        registro["bytes_ilegiveis"] = base + "-ilegivel.bin"
                    except OSError:
                        pass
                    imagens = []
            if imagens:
                if info.get("finishReason") not in (None, "STOP"):
                    avisos.append(f"{nome} variante {k}: veio imagem, mas com finishReason {info.get('finishReason')}; conferir com atenção")
                if info.get("imagem_de_pensamento"):
                    avisos.append(f"{nome} variante {k}: só veio imagem marcada como pensamento; usei a última")
                arq = base + MIME_EXT.get(mime_saida, ".png")
                with open(arq, "wb") as fh:  # bytes como vieram (mantém SynthID e C2PA)
                    fh.write(conteudo)
                extras = []
                for j, (m, c) in enumerate(imagens[:-1], 1):  # pagas também: guarda para conferir
                    extra = f"{base}-extra{j}{MIME_EXT.get(m, '.png')}"
                    with open(extra, "wb") as fh:
                        fh.write(c)
                    extras.append(extra)
                # várias imagens finais são todas cobradas, e o usageMetadata pode vir abaixo do que é cobrado
                custo = max(estimado * len(imagens), custo_uso or 0)
                registro.update(status="ok", arquivo=arq, extras=extras, custo_usd=anterior.get("custo_usd", 0) + custo)
                registro.pop("motivo", None)
                if len(imagens) > 1:
                    avisos.append(f"{nome} variante {k}: vieram {len(imagens)} imagens finais (todas cobradas); extras guardadas")
                print(f"  {k}: ok -> {os.path.basename(arq)} ({registro['segundos']} s, uso US$ {br(custo_uso or 0, 3)}, "
                      f"conta US$ {br(custo, 3)} no teto)")
            else:
                if veio_imagem:  # veio imagem, mas estragada: foi gerada e cobrada como uma boa
                    custo = max(estimado * veio_imagem, custo_uso or 0)
                else:
                    custo = custo_uso if custo_uso is not None else estimado
                registro.update(status="sem_imagem", custo_usd=anterior.get("custo_usd", 0) + custo)
                print(f"  {k}: {registro.get('motivo')}. Registrado (conta US$ {br(custo, 3)}); sigo para a próxima.")
                avisos.append(f"{nome} variante {k}: {registro.get('motivo')}")
            dados["variantes"][chave] = registro
            salvar(estado, dados)
            novos_usd += custo
            uso_usd += custo_uso or 0

        # checagem local + folha de comparação desta foto
        prontas = [(k, dados["variantes"].get(c)) for k, c in enumerate(chaves, 1)]
        if not any(v for _, v in prontas):
            continue
        alfa_o = alfa_produto(img, args.isnet, sha)
        paineis = [("original", os.path.basename(caminho), (40, 40, 40), img, None)]
        for k, v in prontas:
            if not v:
                continue
            arq_v = localizar(v.get("arquivo"), estado) if v.get("status") == "ok" else None
            if not arq_v:
                paineis.append((f"variante {k}", v.get("motivo") or v.get("status", ""), (170, 40, 40), None, None))
                continue
            try:
                im_v = abrir(arq_v)
            except Exception as e:  # arquivo corrompido não derruba a rodada inteira
                paineis.append((f"variante {k}", f"{os.path.basename(arq_v)} ilegível: {e}", (170, 40, 40), None, None))
                avisos.append(f"{nome} variante {k}: {os.path.basename(arq_v)} ilegível ({e})")
                continue
            if not v.get("checagem") or args.rechecar:
                v["checagem"] = checar(img, alfa_o, im_v, alfa_produto(im_v, args.isnet))
                salvar(estado, dados)
            c = v["checagem"]
            print(f"  checagem {k}: {resumo_checagem(c)}")
            titulo = f"variante {k}" + (" (simulada)" if v.get("simulado") else "") + (" · CONFERIR" if c.get("conferir") else "")
            texto = f"{os.path.basename(arq_v)} · {resumo_checagem(c)}"
            marcas = [c["pior_bloco_variante"]] if c.get("pior_bloco", 0) > LIMITE_BLOCO and c.get("pior_bloco_variante") else None
            paineis.append((titulo, texto, (190, 90, 0) if c.get("conferir") else (30, 120, 60), im_v, marcas))
        destino = os.path.join(saida, f"comparar-{nome}{sufixo_sim}.jpg")
        folha(destino, paineis)
        print(f"  folha: {destino}")

    print(f"\nnovos nesta rodada: US$ {br(novos_usd, 3)} contados no teto (usageMetadata: US$ {br(uso_usd, 3)}) · "
          f"total registrado: US$ {br(gasto_total(), 3)} de US$ {br(args.teto_usd)}")
    for a in avisos:
        print(f"aviso: {a}")
    print("Próximo passo: abrir as folhas comparar-*.jpg e comparar peça por peça com a original; "
          "só então rodar 'promover' na variante fiel.")
    if parou:
        raise SystemExit(2)


# ---------------------------------------------------------------- promover

def procurar_no_estado(variante):
    estado = os.path.join(os.path.dirname(variante), "estado-gemini.json")
    if not os.path.exists(estado):
        return None, None, None
    dados = carregar(estado)
    for v in dados["variantes"].values():  # pelo caminho registrado ou, se a pasta mudou de lugar, pelo nome
        if v.get("arquivo") and localizar(v["arquivo"], estado) == variante:
            return estado, dados, v
    meu = sha256(variante)  # cópia renomeada de uma variante registrada (uma simulada, por exemplo)
    for v in dados["variantes"].values():
        arq = localizar(v.get("arquivo"), estado)
        if arq and sha256(arq) == meu:
            return estado, dados, v
    return estado, dados, None


def achar_original(pasta, nome):
    for ext in (".jpg", ".jpeg", ".png", ".webp", ".JPG", ".JPEG", ".PNG"):
        p = os.path.join(pasta, nome + ext)
        if os.path.exists(p):
            return p
    return None


def promover(args):
    variante = os.path.abspath(args.variante)
    if not os.path.isfile(variante):
        raise SystemExit(f"variante não encontrada: {args.variante}")
    if args.pasta_produto:
        pasta = os.path.abspath(args.pasta_produto)
    else:
        d = os.path.dirname(variante)
        if os.path.basename(d) != "gemini" or os.path.basename(os.path.dirname(d)) != "tratadas":
            raise SystemExit("a variante não está em <pasta do produto>/tratadas/gemini/: informe --pasta-produto")
        pasta = os.path.dirname(os.path.dirname(d))
    nome = args.nome or re.sub(r"-\d+(-simulada)?(-extra\d+)?$", "", os.path.splitext(os.path.basename(variante))[0])
    tratadas = os.path.join(pasta, "tratadas")
    os.makedirs(tratadas, exist_ok=True)

    estado, dados, v = procurar_no_estado(variante)
    simulada = bool(v and v.get("simulado")) or "-simulada" in os.path.basename(variante)
    if simulada and not args.permitir_simulada:
        raise SystemExit("esta variante é SIMULADA (a própria foto com o produto clareado, sem o Gemini): as cores do "
                         "produto foram mexidas de propósito e ela não pode ir para a fábrica. Para testar o 'promover' "
                         "numa CÓPIA da pasta do produto, use --permitir-simulada.")
    if simulada:
        print("AVISO: esta variante é SIMULADA (a própria foto clareada, sem o Gemini). Serve só para teste.")
    if v is None:
        print(f"aviso: {os.path.basename(variante)} não está no estado-gemini.json da pasta; não sei a checagem dela")
    if v and (v.get("checagem") or {}).get("conferir"):
        print(f"aviso: a checagem local marcou conferir ({'; '.join(v['checagem'].get('motivos', []))}). "
              "Promova só se a comparação visual peça por peça confirmou que o produto não mudou.")

    img = abrir(variante)
    alfa = alfa_produto(img, args.isnet)
    caixa = caixa_produto(alfa)
    if caixa is None:
        raise SystemExit(f"não achei o produto em {variante}")
    m = int(0.03 * max(img.size))
    caixa = (max(0, caixa[0] - m), max(0, caixa[1] - m), min(img.width, caixa[2] + m), min(img.height, caixa[3] + m))
    rgba = img.copy()
    rgba.putalpha(Image.fromarray((alfa * 255).astype(np.uint8), mode="L"))
    rgba = rgba.crop(caixa)

    destino = os.path.join(tratadas, nome + ".png")
    if os.path.exists(destino):
        guarda = os.path.join(tratadas, "recorte-local", nome + ".png")
        if os.path.exists(guarda):
            print(f"o recorte local já estava guardado em {guarda} (mantido); {destino} será substituído")
        else:
            os.makedirs(os.path.dirname(guarda), exist_ok=True)
            shutil.copy2(destino, guarda)
            print(f"recorte local anterior guardado em {guarda}")
    tmp = destino + ".tmp.png"
    rgba.save(tmp)
    os.replace(tmp, destino)  # a fábrica nunca lê um arquivo pela metade

    # prévia: original | final sobre o creme, mesma altura
    final = Image.new("RGB", rgba.size, CREME)
    final.paste(rgba, (0, 0), rgba)
    original = achar_original(pasta, nome)
    paineis = ([abrir(original)] if original else []) + [final]
    altura = 900
    paineis = [p.resize((round(p.width * altura / p.height), altura), Image.Resampling.LANCZOS) for p in paineis]
    previa = Image.new("RGB", (sum(p.width for p in paineis) + 20 * (len(paineis) - 1), altura), (255, 255, 255))
    x = 0
    for p in paineis:
        previa.paste(p, (x, 0))
        x += p.width + 20
    caminho_previa = os.path.join(tratadas, f"previa-gemini-{nome}.jpg")
    previa.save(caminho_previa, quality=88)
    if not original:
        print(f"aviso: não achei a foto original {nome}.* em {pasta}; a prévia mostra só o resultado")

    if v is not None:
        v["promovida"] = {"arquivo": destino, "quando": agora()}
        salvar(estado, dados)
    print(f"ok {destino} {rgba.width}x{rgba.height} (a fábrica passa a usar esta versão)")
    print(f"prévia {caminho_previa}")


# ---------------------------------------------------------------- linha de comando

def main():
    ap = argparse.ArgumentParser(description="Fotos de produto tratadas no Gemini, sem mudar o produto.")
    sub = ap.add_subparsers(dest="comando", required=True)

    g = sub.add_parser("gerar", help="pede variantes ao Gemini e monta a folha de comparação")
    g.add_argument("fotos", nargs="+")
    g.add_argument("--saida", help="padrão: <pasta da foto>/tratadas/gemini")
    g.add_argument("--modelo", default=MODELO_PADRAO)
    g.add_argument("--variantes", type=int, default=2, help="pedidos separados por foto (padrão 2)")
    g.add_argument("--tamanho", help="512, 1K, 2K ou 4K (padrão 2K; o gemini-2.5-flash-image não aceita)")
    g.add_argument("--proporcao", default="auto",
                   help="auto (a suportada mais próxima da foto), omitir (o modelo escolhe) ou um valor como 4:3")
    g.add_argument("--descricao", help="peças, cores e textos do produto, em inglês; reforça a fidelidade")
    g.add_argument("--teto-usd", type=float, default=2.0)
    g.add_argument("--usd-por-imagem", type=float, help="obrigatório para modelo fora da tabela; substitui o valor orçado")
    g.add_argument("--estado", help="padrão: <saida>/estado-gemini.json")
    g.add_argument("--repetir-falhas", action="store_true", help="tenta de novo (uma vez) as variantes que vieram sem imagem")
    g.add_argument("--rechecar", action="store_true", help="refaz a checagem local mesmo se já estiver no estado")
    g.add_argument("--simular", action="store_true", help="não chama a API: testa o fluxo com a própria foto clareada")
    g.add_argument("--isnet", default=ISNET_PADRAO, help="modelo ISNet (onnx) usado no recorte e na checagem")

    p = sub.add_parser("promover", help="recorta a variante aprovada e grava tratadas/<nome>.png para a fábrica")
    p.add_argument("variante")
    p.add_argument("--nome", help="padrão: o nome da variante sem o sufixo -<k>")
    p.add_argument("--pasta-produto", help="padrão: a pasta acima de tratadas/gemini/")
    p.add_argument("--isnet", default=ISNET_PADRAO)
    p.add_argument("--permitir-simulada", action="store_true", help="só para teste numa cópia da pasta do produto")

    args = ap.parse_args()
    if args.comando == "gerar":
        if args.proporcao not in ("auto", "omitir") and args.proporcao not in PROPORCOES + PROPORCOES_EXTRA:
            raise SystemExit(f"--proporcao inválida: {args.proporcao}")
        gerar(args)
    else:
        promover(args)


if __name__ == "__main__":
    main()
