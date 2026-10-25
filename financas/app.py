"""Parceiro de Prosperidade · servidor local.

  python app.py            abre em http://localhost:8765 (só neste computador)
  python app.py --rede     libera para o celular na mesma rede Wi-Fi (pede um PIN)
  python app.py --demo     começa no modo demo (dados fictícios)
"""
from __future__ import annotations

import argparse
import hmac
import json
import mimetypes
import re
import secrets
import socket
import sys
import threading
import webbrowser
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from nucleo import (acoes, alertas, analises, backup, categorizar, db, demo, dividas, importacao, planejamento,
                    previstos, rendas, resumo)
from nucleo.util import agora_iso, hoje, normalizar, parse_valor

WEB = Path(__file__).resolve().parent / "web"
ESTADO = {"modo": "real", "pin": None, "tokens": set()}
TRAVA = threading.Lock()
LIMITE_UPLOAD = 25 * 1024 * 1024


def caminho_banco():
    return db.BANCO_DEMO if ESTADO["modo"] == "demo" else db.BANCO_REAL


def pasta_entrada():
    return db.ENTRADA_DEMO if ESTADO["modo"] == "demo" else db.ENTRADA_REAL


class Erro(Exception):
    def __init__(self, msg, status=400):
        super().__init__(msg)
        self.status = status


ROTAS: list[tuple[str, re.Pattern, callable]] = []


def rota(metodo, padrao):
    def dec(fn):
        ROTAS.append((metodo, re.compile("^" + padrao + "$"), fn))
        return fn
    return dec


def _int(v, nome="valor"):
    if v in (None, ""):
        return None
    try:
        return int(v)
    except (TypeError, ValueError):
        raise Erro(f"{nome} inválido")


def _centavos(v):
    """Aceita centavos (int) ou texto em reais ('1.234,56')."""
    if v in (None, ""):
        return None
    if isinstance(v, int):
        return v
    c = parse_valor(v)
    if c is None:
        raise Erro(f"Valor inválido: {v}")
    return c


# ---------------------------------------------------------------- estado e home

@rota("GET", "/api/estado")
def r_estado(con, q, corpo):
    n = con.execute("SELECT COUNT(*) FROM transacoes").fetchone()[0]
    return {"modo": ESTADO["modo"], "transacoes": n, "hoje": hoje().isoformat(),
            "demo_existe": db.BANCO_DEMO.exists()}


@rota("POST", "/api/modo")
def r_modo(con, q, corpo):
    modo = corpo.get("modo")
    if modo not in ("real", "demo"):
        raise Erro("modo inválido")
    if modo == "demo" and (corpo.get("recriar") or not db.BANCO_DEMO.exists()):
        demo.criar()
    ESTADO["modo"] = modo
    return {"modo": modo}


@rota("GET", "/api/home")
def r_home(con, q, corpo):
    return resumo.home(con, q.get("mes"))


# ---------------------------------------------------------------- cadastros

@rota("GET", "/api/cadastros")
def r_cadastros(con, q, corpo):
    return {
        "pessoas": db.linhas(con.execute("SELECT * FROM pessoas ORDER BY id")),
        "contas": db.linhas(con.execute("SELECT c.*, p.nome AS titular FROM contas c "
                                        "LEFT JOIN pessoas p ON p.id = c.titular_id ORDER BY c.id")),
        "categorias": db.linhas(con.execute(
            "SELECT c.*, (SELECT COUNT(*) FROM transacoes t WHERE t.categoria_id = c.id) AS usos "
            "FROM categorias c WHERE c.ativa = 1 ORDER BY c.ordem, c.nome")),
        "portadores": db.linhas(con.execute("SELECT * FROM portadores ORDER BY conta_id, id")),
        "dividas": db.linhas(con.execute("SELECT id, nome FROM dividas WHERE status != 'quitada' ORDER BY ordem")),
    }


CAMPOS_CONTA = {"nome", "instituicao", "tipo", "titular_id", "pasta", "identificador", "dia_vencimento",
                "dia_fechamento", "ativa", "observacao", "limite"}


@rota("POST", "/api/contas")
def r_conta_nova(con, q, corpo):
    nome = (corpo.get("nome") or "").strip()
    if not nome:
        raise Erro("Dê um nome para a conta")
    apelido = re.sub(r"[^a-z0-9]+", "-", normalizar(nome).lower()).strip("-")
    con.execute("INSERT INTO contas (apelido, nome, instituicao, tipo, titular_id, pasta) VALUES (?,?,?,?,?,?)",
                (apelido, nome, corpo.get("instituicao") or nome, corpo.get("tipo") or "corrente",
                 _int(corpo.get("titular_id")), apelido))
    con.commit()
    return {"ok": True}


@rota("PATCH", r"/api/contas/(\d+)")
def r_conta(con, q, corpo, cid):
    campos = {k: v for k, v in corpo.items() if k in CAMPOS_CONTA}
    if "limite" in campos:
        campos["limite"] = _centavos(campos["limite"])
    if campos:
        con.execute(f"UPDATE contas SET {', '.join(k + ' = ?' for k in campos)} WHERE id = ?",
                    (*campos.values(), int(cid)))
        con.commit()
    return {"ok": True}


@rota("POST", "/api/portadores")
def r_portador(con, q, corpo):
    con.execute("INSERT INTO portadores (conta_id, pessoa_id, padrao, papel) VALUES (?,?,?,?)",
                (_int(corpo["conta_id"]), _int(corpo["pessoa_id"]), normalizar(corpo["padrao"]),
                 corpo.get("papel") or "adicional"))
    con.commit()
    return {"ok": True}


@rota("DELETE", r"/api/portadores/(\d+)")
def r_portador_del(con, q, corpo, pid):
    con.execute("DELETE FROM portadores WHERE id = ?", (int(pid),))
    con.commit()
    return {"ok": True}


@rota("POST", "/api/categorias")
def r_categoria_nova(con, q, corpo):
    nome = (corpo.get("nome") or "").strip()
    if not nome:
        raise Erro("Dê um nome para a categoria")
    con.execute("INSERT INTO categorias (nome, tipo, cor, ordem) VALUES (?,?,?,80)",
                (nome, corpo.get("tipo") or "despesa", corpo.get("cor") or "#8B95A5"))
    con.commit()
    return {"ok": True}


@rota("PATCH", r"/api/categorias/(\d+)")
def r_categoria(con, q, corpo, cid):
    campos = {k: v for k, v in corpo.items() if k in {"nome", "cor", "tipo", "ativa", "fixa", "orcamento"}}
    if "orcamento" in campos:
        campos["orcamento"] = _centavos(campos["orcamento"]) or None
    if campos:
        con.execute(f"UPDATE categorias SET {', '.join(k + ' = ?' for k in campos)} WHERE id = ?",
                    (*campos.values(), int(cid)))
        con.commit()
    return {"ok": True}


# ---------------------------------------------------------------- lançamentos e fila de dúvidas

@rota("GET", "/api/transacoes")
def r_transacoes(con, q, corpo):
    filtros, args = ["1=1"], []
    if q.get("mes"):
        filtros.append("t.mes_ref = ?"); args.append(q["mes"])          # regime de caixa (cartão pela fatura)
    for campo in ("conta_id", "categoria_id", "pessoa_id"):
        if q.get(campo):
            if q[campo] == "0":
                filtros.append(f"t.{campo} IS NULL")
            else:
                filtros.append(f"t.{campo} = ?"); args.append(int(q[campo]))
    if q.get("tipo"):
        filtros.append("t.tipo = ?"); args.append(q["tipo"])
    if q.get("escopo"):
        filtros.append("t.escopo = ?"); args.append(q["escopo"])
    if q.get("parcelado"):
        filtros.append("t.parcela_total IS NOT NULL")
    if q.get("q"):
        filtros.append("(t.descricao LIKE ? OR t.chave LIKE ?)"); args += [f"%{q['q']}%", f"%{normalizar(q['q'])}%"]
    limite = min(int(q.get("limite") or 300), 2000)
    itens = db.linhas(con.execute(f"""
        SELECT t.*, co.nome AS conta, co.tipo AS conta_tipo, p.nome AS pessoa, cat.nome AS categoria,
               cat.cor AS cor, cat.tipo AS categoria_tipo, d.nome AS divida
        FROM transacoes t JOIN contas co ON co.id = t.conta_id LEFT JOIN pessoas p ON p.id = t.pessoa_id
        LEFT JOIN categorias cat ON cat.id = t.categoria_id LEFT JOIN dividas d ON d.id = t.divida_id
        WHERE {' AND '.join(filtros)} ORDER BY t.data DESC, t.id DESC LIMIT {limite}""", args))
    for t in itens:
        t["marketplace"] = t["valor"] < 0 and analises.eh_marketplace(t["descricao"])
    return {"itens": itens}


@rota("GET", "/api/duvidas")
def r_duvidas(con, q, corpo):
    itens = db.linhas(con.execute("""
        SELECT t.*, co.nome AS conta, co.tipo AS conta_tipo, p.nome AS pessoa, s.nome AS sugestao,
          (SELECT COUNT(*) FROM transacoes t2 WHERE t2.chave = t.chave AND t2.classificacao = 'duvida'
             AND t2.id != t.id AND (t2.valor > 0) = (t.valor > 0)) AS parecidos
        FROM transacoes t JOIN contas co ON co.id = t.conta_id LEFT JOIN pessoas p ON p.id = t.pessoa_id
        LEFT JOIN categorias s ON s.id = t.sugestao_id
        WHERE t.classificacao = 'duvida' ORDER BY t.data DESC, t.id DESC LIMIT 200"""))
    # mostra um por estabelecimento: classificar um resolve os parecidos
    vistos, unicos = set(), []
    for t in itens:
        k = (t["chave"] or f"#{t['id']}", t["valor"] > 0)
        if k in vistos:
            continue
        vistos.add(k)
        unicos.append(t)
    return {"itens": unicos, "total": len(itens)}


@rota("POST", r"/api/transacoes/(\d+)/classificar")
def r_classificar(con, q, corpo, tid):
    tipo = corpo.get("tipo")
    if tipo not in (None, "normal", "transferencia", "fatura", "investimento", "beneficio"):
        raise Erro("tipo inválido")
    r = categorizar.aprender(con, int(tid), _int(corpo.get("categoria_id")), _int(corpo.get("pessoa_id")),
                             corpo.get("escopo"), tipo, bool(corpo.get("lembrar", True)),
                             _int(corpo.get("divida_id")) if "divida_id" in corpo else None)
    alertas.gerar(con)
    return r


@rota("PATCH", r"/api/transacoes/(\d+)")
def r_tx(con, q, corpo, tid):
    campos = {}
    if "pessoa_id" in corpo:
        campos["pessoa_id"] = _int(corpo["pessoa_id"])
    if "escopo" in corpo and corpo["escopo"] in ("pessoal", "negocio"):
        campos["escopo"] = corpo["escopo"]
    if "observacao" in corpo:
        campos["observacao"] = corpo["observacao"]
    if "produto" in corpo:
        analises.salvar_produto(con, int(tid), corpo["produto"])
    if "competencia" in corpo:
        comp = corpo["competencia"] or None
        if comp and not re.fullmatch(r"\d{4}-\d{2}", comp):
            raise Erro("Mês inválido (use AAAA-MM)")
        con.execute("UPDATE transacoes SET competencia = ?, mes_ref = NULL WHERE id = ?", (comp, int(tid)))
        db.atualizar_mes_ref(con, so_vazios=True)
    if campos:
        con.execute(f"UPDATE transacoes SET {', '.join(k + ' = ?' for k in campos)} WHERE id = ?",
                    (*campos.values(), int(tid)))
        con.commit()
    return {"ok": True}


@rota("GET", "/api/regras")
def r_regras(con, q, corpo):
    return {"itens": db.linhas(con.execute(
        "SELECT r.*, c.nome AS categoria FROM regras r LEFT JOIN categorias c ON c.id = r.categoria_id "
        "ORDER BY CASE r.origem WHEN 'semente' THEN 1 ELSE 0 END, r.usos DESC, r.padrao"))}


@rota("POST", "/api/regras")
def r_regra_nova(con, q, corpo):
    padrao = normalizar(corpo.get("padrao") or "")
    if len(padrao) < 3:
        raise Erro("O texto da regra precisa de pelo menos 3 letras")
    con.execute("INSERT INTO regras (padrao, categoria_id, escopo, tipo, sinal, origem, criado_em) "
                "VALUES (?,?,?,?,?, 'manual', ?)",
                (padrao, _int(corpo.get("categoria_id")), corpo.get("escopo"), corpo.get("tipo"),
                 corpo.get("sinal"), agora_iso()))
    con.commit()
    n = categorizar.reclassificar_duvidas(con)
    return {"ok": True, "reclassificados": n}


@rota("DELETE", r"/api/regras/(\d+)")
def r_regra_del(con, q, corpo, rid):
    con.execute("DELETE FROM regras WHERE id = ?", (int(rid),))
    con.commit()
    return {"ok": True}


# ---------------------------------------------------------------- análises

@rota("GET", "/api/recorrentes")
def r_recorrentes(con, q, corpo):
    return {"itens": analises.recorrentes(con)}


@rota("GET", "/api/parcelamentos")
def r_parcelamentos(con, q, corpo):
    mes = q.get("mes") or hoje().strftime("%Y-%m")
    if not re.fullmatch(r"\d{4}-\d{2}", mes):
        raise Erro("mês inválido")
    from nucleo.util import somar_meses
    grupos = analises.parcelamentos(con)
    for g in grupos:
        g.pop("ocorrencias", None)
    agenda = analises.agenda_parcelas(con, somar_meses(mes, -2), 8)
    return {"mes": mes, "itens": grupos, "agenda": agenda, "detalhe": analises.parcelas_do_mes(con, mes),
            "restante_total": sum(g["restante"] for g in grupos),
            "termina": max((g["termina"] for g in grupos), default=None)}


@rota("GET", "/api/marketplace")
def r_marketplace(con, q, corpo):
    itens = analises.compras_marketplace(con, so_sem_produto=q.get("pendentes") == "1")
    return {"itens": itens, "pendentes": sum(1 for i in itens if not i["produto"])}


@rota("GET", "/api/flash")
def r_flash(con, q, corpo):
    """Módulo separado: o Flash não entra em nenhum total do controle."""
    conta = con.execute("SELECT id FROM contas WHERE tipo = 'beneficio' ORDER BY id LIMIT 1").fetchone()
    if not conta:
        return {"existe": False}
    cid = conta["id"]
    ini = db.config(con, "flash_saldo_inicial", None)
    data_ini = db.config(con, "flash_data_inicial", None)
    saldo = None
    if ini not in (None, "") and data_ini:
        mov = con.execute("SELECT COALESCE(SUM(valor), 0) FROM transacoes WHERE conta_id = ? AND data > ?",
                          (cid, data_ini)).fetchone()[0]
        saldo = int(float(ini)) + mov
    itens = db.linhas(con.execute("""SELECT t.id, t.data, t.descricao, t.valor, cat.nome AS categoria
        FROM transacoes t LEFT JOIN categorias cat ON cat.id = t.categoria_id WHERE t.conta_id = ?
        ORDER BY t.data DESC, t.id DESC LIMIT 200""", (cid,)))
    mes = hoje().strftime("%Y-%m")
    gastos = db.linhas(con.execute("""SELECT COALESCE(cat.nome, 'Sem categoria') AS nome, SUM(t.valor) AS total
        FROM transacoes t LEFT JOIN categorias cat ON cat.id = t.categoria_id
        WHERE t.conta_id = ? AND t.valor < 0 AND t.data LIKE ? GROUP BY 1 ORDER BY 2""", (cid, mes + "%")))
    return {"existe": True, "saldo": saldo, "data_inicial": data_ini, "itens": itens, "gastos_mes": gastos}


@rota("GET", "/api/meses")
def r_meses(con, q, corpo):
    meses = [r[0] for r in con.execute("SELECT DISTINCT substr(data,1,7) FROM transacoes ORDER BY 1 DESC")]
    return {"meses": meses or [hoje().strftime("%Y-%m")]}


# ---------------------------------------------------------------- alertas

@rota("GET", "/api/alertas")
def r_alertas(con, q, corpo):
    return {"itens": alertas.listar(con, incluir_dispensados=bool(q.get("todos"))),
            "config": [dict(r, parametros=json.loads(r["parametros"] or "{}"))
                       for r in con.execute("SELECT * FROM config_alertas ORDER BY rowid")]}


@rota("POST", r"/api/alertas/(\d+)/dispensar")
def r_alerta_dispensar(con, q, corpo, aid):
    con.execute("UPDATE alertas SET dispensado = 1 WHERE id = ?", (int(aid),))
    con.commit()
    return {"ok": True}


@rota("PATCH", r"/api/config-alertas/(\w+)")
def r_config_alerta(con, q, corpo, tipo):
    if "ativo" in corpo:
        con.execute("UPDATE config_alertas SET ativo = ? WHERE tipo = ?", (1 if corpo["ativo"] else 0, tipo))
    if "parametros" in corpo:
        con.execute("UPDATE config_alertas SET parametros = ? WHERE tipo = ?", (json.dumps(corpo["parametros"]), tipo))
    con.commit()
    alertas.gerar(con)
    return {"ok": True}


# ---------------------------------------------------------------- dívidas

CAMPOS_DIVIDA = {"nome", "credor", "tipo", "saldo_base", "data_base", "parcela_valor", "dia_vencimento",
                 "parcelas_restantes", "mes_final", "juros_mensal", "status", "forma_pagamento",
                 "reconhecer_valor", "reconhecer_texto", "reconhecer_janela", "plano_mensal", "plano_data_alvo",
                 "urgencia", "observacao", "ordem", "parcelas_total", "data_inicio", "valor_emprestado"}
DINHEIRO_DIVIDA = {"saldo_base", "parcela_valor", "reconhecer_valor", "plano_mensal", "valor_emprestado"}


@rota("GET", "/api/dividas")
def r_dividas(con, q, corpo):
    p = dividas.painel(con)
    p["juros_rotativo"] = dividas.juros_rotativo(con)
    return p


def _campos_divida(corpo):
    campos = {}
    for k, v in corpo.items():
        if k not in CAMPOS_DIVIDA:
            continue
        if k in DINHEIRO_DIVIDA:
            v = _centavos(v)
        elif k in ("dia_vencimento", "parcelas_restantes", "reconhecer_janela", "urgencia", "ordem", "parcelas_total"):
            v = _int(v, k)
        elif k == "juros_mensal":
            v = None if v in (None, "") else float(str(v).replace(",", "."))
        elif isinstance(v, str):
            v = v.strip() or None
        campos[k] = v
    if campos.keys() & {"saldo_base", "parcelas_restantes"} and "data_base" not in campos:
        campos["data_base"] = hoje().isoformat()     # saldo informado vale a partir de hoje
    if campos.get("reconhecer_texto"):
        campos["reconhecer_texto"] = normalizar(campos["reconhecer_texto"])
    return campos


@rota("POST", "/api/dividas")
def r_divida_nova(con, q, corpo):
    campos = _campos_divida(corpo)
    if not campos.get("nome"):
        raise Erro("Dê um nome para a dívida")
    campos.setdefault("data_base", hoje().isoformat())
    campos["criado_em"] = agora_iso()
    con.execute(f"INSERT INTO dividas ({', '.join(campos)}) VALUES ({', '.join('?' * len(campos))})",
                tuple(campos.values()))
    con.commit()
    return {"ok": True}


@rota("PATCH", r"/api/dividas/(\d+)")
def r_divida(con, q, corpo, did):
    campos = _campos_divida(corpo)
    if campos:
        con.execute(f"UPDATE dividas SET {', '.join(k + ' = ?' for k in campos)} WHERE id = ?",
                    (*campos.values(), int(did)))
        con.commit()
    dividas.reconhecer_pagamentos(con)
    alertas.gerar(con)
    return {"ok": True}


@rota("POST", r"/api/dividas/(\d+)/negociacao")
def r_negociacao(con, q, corpo, did):
    texto = (corpo.get("texto") or "").strip()
    if not texto:
        raise Erro("Escreva o que foi combinado")
    con.execute("INSERT INTO negociacoes (divida_id, data, texto) VALUES (?,?,?)",
                (int(did), corpo.get("data") or hoje().isoformat(), texto))
    con.commit()
    return {"ok": True}


@rota("POST", r"/api/dividas/(\d+)/pagamento")
def r_pagamento(con, q, corpo, did):
    valor = _centavos(corpo.get("valor"))
    if not valor:
        raise Erro("Informe o valor pago")
    con.execute("INSERT INTO pagamentos_divida (divida_id, data, valor, observacao) VALUES (?,?,?,?)",
                (int(did), corpo.get("data") or hoje().isoformat(), abs(valor), corpo.get("observacao")))
    con.commit()
    return {"ok": True}


@rota("POST", "/api/simular/cartao")
def r_sim_cartao(con, q, corpo):
    valor = _centavos(corpo.get("valor")) or 0
    fatura = _centavos(corpo.get("fatura_sem_compra"))
    if fatura is None:
        fatura = analises.totais_mes(con, hoje().strftime("%Y-%m"))["cartao"]
    vou_pagar = _centavos(corpo.get("vou_pagar"))
    juros = float(str(corpo.get("juros") or dividas.juros_rotativo(con)).replace(",", "."))
    r = dividas.simular_cartao(valor, fatura, vou_pagar, juros)
    r["fatura_sem_compra"] = fatura
    cartao = dividas.cartao_principal(con)
    venc = cartao and dividas.vencimento_fatura(hoje(), cartao["dia_fechamento"], cartao["dia_vencimento"])
    r["vence_em"] = venc.isoformat() if venc else None
    r["cartao"] = cartao["nome"] if cartao else None
    r["folga_estimada"] = alertas.folga_do_mes(con, hoje().strftime("%Y-%m"))
    return r


@rota("POST", "/api/simular/antecipacao")
def r_sim_antecipacao(con, q, corpo):
    return dividas.simular_antecipacao(_centavos(corpo.get("parcela")) or 0, _int(corpo.get("restantes")) or 0,
                                       float(str(corpo.get("juros") or 0).replace(",", ".")),
                                       _int(corpo.get("antecipar")) or 0)


# ---------------------------------------------------------------- plano (orçamento, projeção, quitação)

@rota("GET", "/api/plano")
def r_plano(con, q, corpo):
    extra = _centavos(q.get("extra")) if q.get("extra") not in (None, "") else None
    meses = min(24, max(1, _int(q.get("meses")) or 3))
    return planejamento.plano(con, extra, meses, q.get("bola", "1") != "0", _centavos(q.get("liberar")) or 0)


@rota("POST", "/api/orcamento/aplicar")
def r_orcamento_aplicar(con, q, corpo):
    itens = [{"id": _int(i.get("id")), "orcamento": _centavos(i.get("orcamento"))} for i in corpo.get("itens", [])]
    if not itens:
        raise Erro("Nenhuma categoria enviada")
    total = planejamento.aplicar_orcamento(con, itens)
    alertas.gerar(con)
    return {"ok": True, "orcamento_mensal": total}


# ---------------------------------------------------------------- entradas fixas (salários)

def _renda_corpo(corpo):
    d = {k: corpo[k] for k in ("descricao", "padrao", "observacao") if k in corpo}
    if "dia" in corpo:
        d["dia"] = _int(corpo["dia"], "dia")
    if "valor" in corpo:
        d["valor"] = _centavos(corpo["valor"])
    return d


@rota("POST", "/api/rendas")
def r_renda_nova(con, q, corpo):
    try:
        return {"id": rendas.criar(con, dict(_renda_corpo(corpo), inicio=corpo.get("inicio")))}
    except ValueError as e:
        raise Erro(str(e))


@rota("PATCH", r"/api/rendas/(\d+)")
def r_renda(con, q, corpo, rid):
    try:
        rendas.alterar(con, int(rid), _renda_corpo(corpo), corpo.get("a_partir") or None)
    except ValueError as e:
        raise Erro(str(e))
    return {"ok": True}


@rota("POST", r"/api/rendas/(\d+)/encerrar")
def r_renda_encerrar(con, q, corpo, rid):
    rendas.encerrar(con, int(rid), corpo.get("a_partir") or None)
    return {"ok": True}


# ---------------------------------------------------------------- previstos (provisões)

def _previsto_corpo(corpo):
    d = {}
    for k in ("mes", "ate", "descricao", "chave_auto", "status", "observacao", "categoria_id"):
        if k in corpo:
            d[k] = corpo[k] or None
    if "dia" in corpo:
        d["dia"] = _int(corpo["dia"], "dia")
    if "no_plano" in corpo:
        d["no_plano"] = 1 if corpo["no_plano"] in (True, 1, "1", "on", "true") else 0
    if "valor" in corpo:
        v = _centavos(corpo["valor"])
        if v is None:
            raise Erro("Informe o valor")
        sinal = -1 if corpo.get("sentido") == "saida" else 1 if corpo.get("sentido") == "entrada" else None
        d["valor"] = abs(v) * sinal if sinal else v
    for k in ("mes", "ate"):
        if d.get(k) and d[k] != "*" and not re.fullmatch(r"\d{4}-\d{2}", d[k]):
            raise Erro("Mês inválido (use AAAA-MM)")
    return d


@rota("GET", "/api/previstos")
def r_previstos(con, q, corpo):
    return previstos.do_mes(con, q.get("mes") or hoje().strftime("%Y-%m"))


@rota("POST", "/api/previstos")
def r_previsto_novo(con, q, corpo):
    d = _previsto_corpo(corpo)
    if not d.get("mes") or not d.get("descricao") or "valor" not in d:
        raise Erro("Mês, descrição e valor são obrigatórios")
    return {"id": previstos.salvar(con, d)}


@rota("PATCH", r"/api/previstos/(\d+)")
def r_previsto(con, q, corpo, pid):
    previstos.salvar(con, _previsto_corpo(corpo), int(pid))
    return {"ok": True}


@rota("DELETE", r"/api/previstos/(\d+)")
def r_previsto_del(con, q, corpo, pid):
    previstos.apagar(con, int(pid))
    return {"ok": True}


# ---------------------------------------------------------------- encontros e plano de ação

@rota("GET", "/api/encontros")
def r_encontros(con, q, corpo):
    return {"encontros": acoes.encontros(con), "ativas": acoes.acoes_ativas(con), "analise": acoes.analise(con)}


@rota("GET", "/api/analise")
def r_analise(con, q, corpo):
    return acoes.analise(con, q.get("ini"), q.get("fim"), q.get("ini_antes"), q.get("fim_antes"))


@rota("POST", "/api/encontros")
def r_encontro_novo(con, q, corpo):
    if not corpo.get("data"):
        raise Erro("Informe a data do encontro")
    eid = acoes.criar_encontro(con, corpo["data"], corpo.get("titulo"), corpo.get("notas"))
    for a in corpo.get("acoes", []):
        a = dict(a, encontro_id=eid)
        a["limite"] = _centavos(a.get("limite")) if a.get("limite") not in (None, "") else None
        a["categoria_id"] = _int(a.get("categoria_id"))
        acoes.criar_acao(con, a)
    for r in corpo.get("revisoes", []):           # como foram os compromissos anteriores
        if r.get("status") or r.get("nota"):
            acoes.registrar(con, _int(r["acao_id"]), r.get("status"), r.get("nota"), eid, corpo["data"])
    return {"id": eid}


@rota("PATCH", r"/api/encontros/(\d+)")
def r_encontro(con, q, corpo, eid):
    campos = {k: corpo[k] for k in ("data", "titulo", "notas") if k in corpo}
    if campos:
        con.execute(f"UPDATE encontros SET {', '.join(k + ' = ?' for k in campos)} WHERE id = ?",
                    (*campos.values(), int(eid)))
        con.commit()
    return {"ok": True}


@rota("POST", "/api/acoes")
def r_acao_nova(con, q, corpo):
    a = dict(corpo)
    a["limite"] = _centavos(a.get("limite")) if a.get("limite") not in (None, "") else None
    a["categoria_id"] = _int(a.get("categoria_id"))
    a["encontro_id"] = _int(a.get("encontro_id"))
    try:
        return {"id": acoes.criar_acao(con, a)}
    except ValueError as e:
        raise Erro(str(e))


@rota("POST", r"/api/acoes/(\d+)/registro")
def r_acao_registro(con, q, corpo, aid):
    acoes.registrar(con, int(aid), corpo.get("status") or None, corpo.get("nota") or None,
                    _int(corpo.get("encontro_id")), corpo.get("data"))
    return {"ok": True}


# ---------------------------------------------------------------- metas e configuração

@rota("GET", "/api/metas")
def r_metas(con, q, corpo):
    return {"itens": db.linhas(con.execute("SELECT * FROM metas WHERE ativa = 1 ORDER BY prioridade, id"))}


@rota("POST", "/api/metas")
def r_meta_nova(con, q, corpo):
    if not corpo.get("nome") or not corpo.get("valor_alvo"):
        raise Erro("Nome e valor são obrigatórios")
    con.execute("INSERT INTO metas (nome, faixa, valor_alvo, guardado, prazo, prioridade, criado_em) "
                "VALUES (?,?,?,?,?,?,?)",
                (corpo["nome"], corpo.get("faixa") or "medio", _centavos(corpo["valor_alvo"]),
                 _centavos(corpo.get("guardado")) or 0, corpo.get("prazo") or None,
                 _int(corpo.get("prioridade")) or 100, agora_iso()))
    con.commit()
    return {"ok": True}


@rota("PATCH", r"/api/metas/(\d+)")
def r_meta(con, q, corpo, mid):
    campos = {}
    for k in ("nome", "faixa", "prazo", "prioridade", "ativa"):
        if k in corpo:
            campos[k] = corpo[k]
    for k in ("valor_alvo", "guardado"):
        if k in corpo:
            campos[k] = _centavos(corpo[k])
    if campos:
        con.execute(f"UPDATE metas SET {', '.join(k + ' = ?' for k in campos)} WHERE id = ?",
                    (*campos.values(), int(mid)))
        con.commit()
    return {"ok": True}


CONFIG_EDITAVEL = {"renda_mensal_esperada", "orcamento_mensal", "meta_poupanca_mensal", "limite_fatura_mensal",
                   "juros_rotativo_mensal", "pasta_backup", "nomes_casal", "meses_reserva"}
CONFIG_DINHEIRO = {"renda_mensal_esperada", "orcamento_mensal", "meta_poupanca_mensal", "limite_fatura_mensal"}


@rota("GET", "/api/config")
def r_config(con, q, corpo):
    return {r["chave"]: r["valor"] for r in con.execute("SELECT * FROM config") if r["chave"] in CONFIG_EDITAVEL}


@rota("PATCH", "/api/config")
def r_config_salvar(con, q, corpo):
    for k, v in corpo.items():
        if k not in CONFIG_EDITAVEL:
            continue
        if k in CONFIG_DINHEIRO:
            v = _centavos(v) or 0
        elif k == "nomes_casal":
            v = json.dumps([normalizar(x) for x in (v if isinstance(v, list) else str(v).split(",")) if x.strip()])
        db.definir_config(con, k, v)
    alertas.gerar(con)
    return {"ok": True}


@rota("POST", "/api/backup")
def r_backup(con, q, corpo):
    destino = (corpo.get("pasta") or db.config(con, "pasta_backup") or "").strip()
    if not destino:
        raise Erro("Escolha a pasta do backup em Ajustes (ex.: a pasta do Google Drive no computador).")
    if corpo.get("pasta"):
        db.definir_config(con, "pasta_backup", destino)
    return backup.fazer(caminho_banco(), Path(destino))


# ---------------------------------------------------------------- importação

@rota("POST", "/api/atualizar")
def r_atualizar(con, q, corpo):
    with TRAVA:
        return importacao.atualizar(con, pasta_entrada())


def _destino_upload(con, conta_id, nome):
    nome = re.sub(r"[^\w.\- ]+", "_", Path(nome).name)[:120] or "arquivo"
    sub = "planilha"
    if conta_id:
        r = con.execute("SELECT pasta FROM contas WHERE id = ?", (conta_id,)).fetchone()
        sub = (r and r["pasta"]) or "_enviados"
    pasta = pasta_entrada() / sub
    pasta.mkdir(parents=True, exist_ok=True)
    destino = pasta / nome
    if destino.exists():
        destino = pasta / f"{destino.stem}-{agora_iso().replace(':', '')}{destino.suffix}"
    return destino, sub


@rota("POST", "/api/upload")
def r_upload(con, q, corpo, bruto=None):
    if not bruto:
        raise Erro("Arquivo vazio")
    conta_id = _int(q.get("conta_id"))
    planilha = q.get("planilha") == "1"
    destino, sub = _destino_upload(con, conta_id, unquote(q.get("nome") or "arquivo.csv"))
    destino.write_bytes(bruto)
    with TRAVA:
        lote = importacao.Lote(con)
        r = lote.arquivo(bruto, destino.name, conta_id, planilha=planilha or sub == "planilha")
        r["caminho"] = f"{sub}/{destino.name}"
        resumo_ = lote.finalizar()
    return resumo_


@rota("POST", "/api/mapear")
def r_mapear(con, q, corpo):
    caminho = (pasta_entrada() / corpo.get("caminho", "")).resolve()
    if pasta_entrada().resolve() not in caminho.parents or not caminho.is_file():
        raise Erro("Arquivo não encontrado")
    m = corpo.get("mapa") or {}
    mapa = {k: _int(m.get(k)) for k in ("data", "valor", "debito", "credito", "portador", "parcela", "categoria",
                                        "tipo_lancamento", "identificador", "conta", "pessoa")}
    mapa["descricao"] = [int(x) for x in m.get("descricao") or []]
    mapa["linha_cabecalho"] = _int(m.get("linha_cabecalho")) or 0
    mapa["inverter"] = bool(m.get("inverter"))
    mapa["conta_fixa"] = _int(m.get("conta_fixa"))
    if mapa["data"] is None or not mapa["descricao"] or (mapa["valor"] is None and mapa["debito"] is None):
        raise Erro("Escolha pelo menos as colunas de data, descrição e valor")
    if mapa["conta"] is None and not mapa["conta_fixa"]:
        raise Erro("Diga de qual conta são os lançamentos (coluna ou conta fixa)")
    bruto = caminho.read_bytes()
    if corpo.get("salvar", True):
        from nucleo.importadores import csv_
        cab = csv_.linhas_csv(bruto)[mapa["linha_cabecalho"]]
        con.execute("INSERT INTO perfis_csv (assinatura, nome, mapeamento, criado_em) VALUES (?,?,?,?) "
                    "ON CONFLICT(assinatura) DO UPDATE SET mapeamento = excluded.mapeamento",
                    (csv_.assinatura(cab), caminho.name, json.dumps(mapa), agora_iso()))
        con.commit()
    with TRAVA:
        lote = importacao.Lote(con)
        lote.arquivo(bruto, caminho.name, mapa["conta_fixa"], mapa=mapa)
        return lote.finalizar()


@rota("GET", "/api/importacoes")
def r_importacoes(con, q, corpo):
    return {"itens": db.linhas(con.execute(
        "SELECT i.*, c.nome AS conta FROM importacoes i LEFT JOIN contas c ON c.id = i.conta_id "
        "ORDER BY i.id DESC LIMIT 30")), "pasta": str(pasta_entrada())}


# ---------------------------------------------------------------- HTTP

PAGINA_PIN = """<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Entrar</title>
<style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;
background:#F6F5F1;color:#1C2321}form{background:#fff;padding:32px;border-radius:20px;box-shadow:0 8px 30px #0001;
width:min(320px,86vw)}input,button{font:inherit;width:100%;box-sizing:border-box;padding:14px;border-radius:12px;
border:1px solid #ddd;margin-top:12px}button{background:#0F766E;color:#fff;border:0}</style></head>
<body><form method="post" action="/entrar"><h2 style="margin:0">Parceiro de Prosperidade</h2>
<p style="color:#667">Digite o PIN que aparece no terminal do computador.</p>
<input name="pin" inputmode="numeric" autocomplete="one-time-code" autofocus>
<button>Entrar</button>{erro}</form></body></html>"""


class Handler(BaseHTTPRequestHandler):
    server_version = "Prosperidade/1"

    def log_message(self, fmt, *args):
        if "/api/" in (args[0] if args else "") and not self.path.startswith("/api/home"):
            sys.stderr.write("· " + (fmt % args) + "\n")

    # --- acesso pela rede
    def _local(self):
        return self.client_address[0] in ("127.0.0.1", "::1", "::ffff:127.0.0.1")

    def _autorizado(self):
        if self._local() or not ESTADO["pin"]:
            return True
        c = SimpleCookie(self.headers.get("Cookie", ""))
        tok = c.get("pp_token")
        return bool(tok and tok.value in ESTADO["tokens"])

    def _enviar(self, status, corpo: bytes, tipo="application/json; charset=utf-8", extra=None):
        self.send_response(status)
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(corpo)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(corpo)

    def _json(self, status, dados):
        self._enviar(status, json.dumps(dados, ensure_ascii=False, default=str).encode())

    def _ler(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n > LIMITE_UPLOAD:
            raise Erro("Arquivo grande demais (máx. 25 MB)", 413)
        return self.rfile.read(n) if n else b""

    def _rotear(self, metodo):
        url = urlparse(self.path)
        if url.path == "/entrar":
            return self._entrar(metodo)
        if not self._autorizado():
            if url.path.startswith("/api/"):
                return self._json(401, {"erro": "Acesso pela rede precisa de PIN"})
            return self._enviar(200, PAGINA_PIN.replace("{erro}", "").encode(), "text/html; charset=utf-8")
        if not url.path.startswith("/api/"):
            return self._estatico(url.path) if metodo == "GET" else self._json(405, {"erro": "método"})
        q = {k: v[0] for k, v in parse_qs(url.query).items()}
        for m, padrao, fn in ROTAS:
            achou = padrao.match(url.path)
            if m == metodo and achou:
                try:
                    bruto = self._ler()
                    if fn is r_upload:
                        corpo, extra = {}, {"bruto": bruto}
                    else:
                        corpo, extra = (json.loads(bruto) if bruto else {}), {}
                    if self.headers.get("Origin") and metodo != "GET":
                        host = self.headers.get("Host", "")
                        if urlparse(self.headers["Origin"]).netloc != host:
                            raise Erro("Origem não permitida", 403)
                    con = db.conectar(caminho_banco())
                    try:
                        return self._json(200, fn(con, q, corpo, *achou.groups(), **extra))
                    finally:
                        con.close()
                except Erro as e:
                    return self._json(e.status, {"erro": str(e)})
                except Exception as e:      # mostra o erro sem derrubar o servidor
                    import traceback
                    traceback.print_exc()
                    return self._json(500, {"erro": f"Erro interno: {e}"})
        return self._json(404, {"erro": "rota não encontrada"})

    def _entrar(self, metodo):
        if metodo == "POST":
            dados = parse_qs(self._ler().decode())
            pin = (dados.get("pin") or [""])[0].strip()
            if ESTADO["pin"] and hmac.compare_digest(pin, ESTADO["pin"]):
                tok = secrets.token_urlsafe(24)
                ESTADO["tokens"].add(tok)
                self.send_response(303)
                self.send_header("Set-Cookie", f"pp_token={tok}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000")
                self.send_header("Location", "/")
                self.end_headers()
                return
            pag = PAGINA_PIN.replace("{erro}", '<p style="color:#B42318">PIN incorreto.</p>')
            return self._enviar(200, pag.encode(), "text/html; charset=utf-8")
        return self._enviar(200, PAGINA_PIN.replace("{erro}", "").encode(), "text/html; charset=utf-8")

    def _estatico(self, caminho):
        if caminho in ("", "/"):
            caminho = "/index.html"
        alvo = (WEB / caminho.lstrip("/")).resolve()
        if WEB not in alvo.parents or not alvo.is_file():
            alvo = WEB / "index.html"
        tipo = mimetypes.guess_type(alvo.name)[0] or "application/octet-stream"
        if tipo.startswith("text/") or tipo in ("application/javascript", "image/svg+xml"):
            tipo += "; charset=utf-8"
        self._enviar(200, alvo.read_bytes(), tipo)

    def do_GET(self):
        self._rotear("GET")

    def do_POST(self):
        self._rotear("POST")

    def do_PATCH(self):
        self._rotear("PATCH")

    def do_DELETE(self):
        self._rotear("DELETE")


def ip_local():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except OSError:
        return "IP-do-computador"


def main():
    ap = argparse.ArgumentParser(description="Parceiro de Prosperidade (servidor local)")
    ap.add_argument("--porta", type=int, default=8765)
    ap.add_argument("--rede", action="store_true", help="libera acesso pelo celular na mesma rede (com PIN)")
    ap.add_argument("--pin", help="PIN fixo para o acesso pela rede (padrão: um novo a cada início)")
    ap.add_argument("--demo", action="store_true", help="abre no modo demo, com dados fictícios")
    ap.add_argument("--sem-navegador", action="store_true")
    a = ap.parse_args()
    if a.demo:
        demo.criar()
        ESTADO["modo"] = "demo"
    con = db.conectar(db.BANCO_REAL)            # cria o banco e o cadastro inicial
    importacao.preparar_pastas(con, db.ENTRADA_REAL)
    con.close()
    host = "0.0.0.0" if a.rede else "127.0.0.1"
    srv = ThreadingHTTPServer((host, a.porta), Handler)
    url = f"http://localhost:{a.porta}"
    print(f"\n  Parceiro de Prosperidade rodando em {url}  (modo {ESTADO['modo']})")
    if a.rede:
        ESTADO["pin"] = a.pin or f"{secrets.randbelow(10 ** 6):06d}"
        print(f"  No celular (mesmo Wi-Fi): http://{ip_local()}:{a.porta}   PIN: {ESTADO['pin']}")
    print("  Para parar: Ctrl+C\n")
    if not a.sem_navegador:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\n  Até logo!")


if __name__ == "__main__":
    main()
