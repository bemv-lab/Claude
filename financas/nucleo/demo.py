"""Modo demo: gera extratos FICTÍCIOS (OFX/CSV nos formatos dos bancos) e importa pelo pipeline real."""
from __future__ import annotations

import random
import shutil
from datetime import date

from . import db
from .importacao import atualizar
from .util import hoje, somar_meses


def _d(mes: str, dia: int) -> date:
    y, m = map(int, mes.split("-"))
    import calendar
    return date(y, m, min(dia, calendar.monthrange(y, m)[1]))


def _br(c: int) -> str:
    s = f"{abs(c) / 100:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return ("-" if c < 0 else "") + s


def gerar_arquivos(pasta, meses: int = 4, semente: int = 7) -> None:
    rnd = random.Random(semente)
    h = hoje()
    lista = [somar_meses(h.strftime("%Y-%m"), -k) for k in range(meses - 1, -1, -1)]
    itau, inter, cartao, bb, flash, nubank = [], [], [], [], [], []

    def ok(dt: date) -> bool:
        return dt <= h

    for i, mes in enumerate(lista):
        # Itaú (Lucas): salário e transferência para a conta da Bárbara
        if ok(_d(mes, 5)):
            itau.append((_d(mes, 5), 520000, "PAGTO SALARIO - EMPRESA EXEMPLO LTDA"))
            itau.append((_d(mes, 6), -150000, "PIX TRANSF BARBARA M 06/" + mes[5:]))
            inter.append((_d(mes, 6), 150000, "Pix recebido - Lucas F"))
        if ok(_d(mes, 8)):
            itau.append((_d(mes, 8), -4590, "TARIFA PACOTE SERVICOS"))
        if ok(_d(mes, 12)):
            itau.append((_d(mes, 12), -18990, "DEB AUT VIVO FIBRA"))
        # Inter conta (Bárbara)
        if ok(_d(mes, 3)):
            inter.append((_d(mes, 3), rnd.choice([180000, 210000, 245000]), "Pix recebido - Cliente Loja Rocco"))
        if ok(_d(mes, 7)):
            inter.append((_d(mes, 7), -160000, "Pix enviado - Imobiliaria Horizonte"))
        if ok(_d(mes, 15 + (i % 2))):
            inter.append((_d(mes, 15 + (i % 2)), -68000, "Pix enviado - Jose Vieira"))     # consignado (pai)
        if ok(_d(mes, 18)):
            inter.append((_d(mes, 18), -rnd.randint(14000, 19000), "Pagamento ENEL distribuicao"))
        if i > 0 and ok(_d(mes, 10)):
            inter.append((_d(mes, 10), -rnd.randint(250000, 330000), "Pagamento fatura cartao Inter"))
        if ok(_d(mes, 20)):
            inter.append((_d(mes, 20), -rnd.choice([5000, 8000, 12000]), "Pix enviado - Maria Aparecida Souza"))
        # Cartão Inter (compras do casal, com portador)
        for _ in range(rnd.randint(16, 22)):
            dia = rnd.randint(1, 28)
            if not ok(_d(mes, dia)):
                continue
            quem = rnd.choice(["BARBARA M VIEIRA", "LUCAS F", "BARBARA M VIEIRA"])
            loja, cat, faixa = rnd.choice([
                ("IFOOD *RESTAURANTE SABOR", "RESTAURANTES", (3500, 9000)),
                ("IFD*PIZZARIA BELLA", "RESTAURANTES", (5000, 11000)),
                ("CARREFOUR HIPER", "SUPERMERCADO", (12000, 42000)),
                ("ASSAI ATACADISTA", "SUPERMERCADO", (15000, 38000)),
                ("UBER *TRIP", "TRANSPORTE", (1500, 4500)),
                ("POSTO IPIRANGA", "TRANSPORTE", (12000, 25000)),
                ("DROGASIL 1234", "FARMACIA", (2500, 12000)),
                ("PADARIA PAO QUENTE", "RESTAURANTES", (1200, 3500)),
                ("SHOPEE *LOJA", "COMPRAS", (3000, 12000)),
                ("CAFE DA ESQUINA", "OUTROS", (900, 2600)),
            ])
            cartao.append((_d(mes, dia), -rnd.randint(*faixa), loja, cat, "Compra à vista", quem))
        for dia, loja, valor in ((4, "NETFLIX.COM", 5590), (9, "SPOTIFY", 2190)):
            if ok(_d(mes, dia)):
                cartao.append((_d(mes, dia), -valor, loja, "SERVICOS", "Compra à vista", "BARBARA M VIEIRA"))
        if i >= meses - 2 and ok(_d(mes, 11)):
            cartao.append((_d(mes, 11), -3500, "CANVA PRO", "SERVICOS", "Compra à vista", "BARBARA M VIEIRA"))
        if ok(_d(mes, 2)):
            cartao.append((_d(mes, 2), -rnd.randint(9000, 20000), "FACEBK *ADS ROCCO", "SERVICOS", "Compra à vista",
                           "BARBARA M VIEIRA"))
        # parcelado antigo (Casas Bahia 6x) e um novo neste mês (Magazine Luiza 10x)
        if 0 < i <= 6 and ok(_d(mes, 14)):
            cartao.append((_d(mes, 14), -41650, "CASAS BAHIA", "COMPRAS", f"Parcela {i}/6", "LUCAS F"))
        if i == meses - 1 and ok(_d(mes, 3)):
            cartao.append((_d(mes, 3), -32990, "MAGAZINE LUIZA", "COMPRAS", "Parcela 1/10", "LUCAS F"))
        if i == meses - 1 and ok(_d(mes, 1)):
            cartao.append((_d(mes, 1), 270000, "PAGAMENTO ON LINE", "", "", ""))
        # BB (Lucas): pouco movimento
        if ok(_d(mes, 22)):
            bb.append((_d(mes, 22), -rnd.randint(4000, 9000), "Compra com Cartao - BARBEARIA DO ZE"))
        if ok(_d(mes, 25)):
            bb.append((_d(mes, 25), -25000, "Pix - Enviado - Academia Corpo Livre"))
        if ok(_d(mes, 24)):
            bb.append((_d(mes, 24), 25000, "Pix - Recebido - Lucas F"))
            itau.append((_d(mes, 24), -25000, "PIX TRANSF LUCAS F 24/" + mes[5:]))
        # Flash (benefício)
        if ok(_d(mes, 1)):
            flash.append((_d(mes, 1), 90000, "Crédito de benefício - Alimentação"))
        for _ in range(4):
            dia = rnd.randint(2, 28)
            if ok(_d(mes, dia)):
                flash.append((_d(mes, dia), -rnd.randint(6000, 19000),
                              rnd.choice(["SUPERMERCADO BOM PRECO", "RESTAURANTE SABOR CASEIRO", "PADARIA REAL"])))
    # Nubank: cobranças antigas (débito em negociação)
    m0 = lista[0]
    nubank += [(_d(m0, 5), 4570, "IOF de atraso"), (_d(m0, 5), 28950, "Juros de atraso"),
               (_d(m0, 5), 9800, "Multa de atraso")]

    pasta.mkdir(parents=True, exist_ok=True)
    for sub in ("itau", "inter-conta", "inter-cartao", "bb", "flash", "nubank"):
        (pasta / sub).mkdir(exist_ok=True)

    # Itaú em OFX
    itens = "".join(
        f"<STMTTRN><TRNTYPE>{'CREDIT' if v > 0 else 'DEBIT'}<DTPOSTED>{d:%Y%m%d}120000[-3:BRT]"
        f"<TRNAMT>{v / 100:.2f}<FITID>{d:%Y%m%d}{k:04d}<MEMO>{t}</STMTTRN>\n"
        for k, (d, v, t) in enumerate(sorted(itau)))
    (pasta / "itau" / "extrato-itau.ofx").write_text(
        "OFXHEADER:100\nDATA:OFXSGML\nVERSION:102\nCHARSET:1252\n\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>"
        "<BANKACCTFROM><BANKID>0341<ACCTID>12345-6</BANKACCTFROM><BANKTRANLIST>\n"
        f"{itens}</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>\n", encoding="cp1252")
    # Inter conta: CSV com linhas de apresentação antes do cabeçalho
    linhas = ["Extrato Conta Corrente", "Conta ;12345678", "Período ;01/01/2026 a 31/12/2026", "",
              "Data Lançamento;Histórico;Descrição;Valor;Saldo"]
    for d, v, t in sorted(inter):
        hist, _, desc = t.partition(" - ") if " - " in t else (t, "", "")
        linhas.append(f"{d:%d/%m/%Y};{hist};{desc};{_br(v)};0,00")
    (pasta / "inter-conta" / "extrato-inter.csv").write_text("\n".join(linhas), encoding="utf-8-sig")
    # Fatura Inter (com coluna do portador)
    linhas = ['"Data";"Lançamento";"Categoria";"Tipo";"Valor";"Portador"']
    for d, v, t, cat, tipo, quem in sorted(cartao):
        linhas.append(f'"{d:%d/%m/%Y}";"{t}";"{cat}";"{tipo}";"R$ {_br(-v)}";"{quem}"')
    (pasta / "inter-cartao" / "fatura-inter.csv").write_text("\n".join(linhas), encoding="utf-8")
    # BB: CSV com "Saldo Anterior"
    linhas = ['"Data","Lançamento","Detalhes","N° documento","Valor","Tipo Lançamento"',
              f'"{_d(lista[0], 1):%d/%m/%Y}","Saldo Anterior","","","1200,00",""']
    for d, v, t in sorted(bb):
        lanc, _, det = t.rpartition(" - ")
        linhas.append(f'"{d:%d/%m/%Y}","{lanc}","{det}","{rnd.randint(1000, 9999)}","{_br(abs(v))}",'
                      f'"{"Entrada" if v > 0 else "Saída"}"')
    (pasta / "bb" / "extrato-bb.csv").write_text("\n".join(linhas), encoding="cp1252")
    # Flash
    linhas = ["Data;Descrição;Valor"] + [f"{d:%d/%m/%Y};{t};{_br(v)}" for d, v, t in sorted(flash)]
    (pasta / "flash" / "extrato-flash.csv").write_text("\n".join(linhas), encoding="utf-8")
    # Nubank fatura (formato date,title,amount)
    linhas = ["date,title,amount"] + [f"{d:%Y-%m-%d},{t},{v / 100:.2f}" for d, v, t in nubank]
    (pasta / "nubank" / "nubank-fatura.csv").write_text("\n".join(linhas), encoding="utf-8")


def criar(caminho_db=None, pasta=None) -> dict:
    caminho_db = caminho_db or db.BANCO_DEMO
    pasta = pasta or db.ENTRADA_DEMO
    for p in (caminho_db,):
        if p.exists():
            p.unlink()
    if pasta.exists():
        shutil.rmtree(pasta)
    gerar_arquivos(pasta)
    con = db.conectar(caminho_db)
    # dívidas com valores de exemplo
    hoje_iso = hoje().isoformat()
    # consignado e MetaEds usam os valores reais do cadastro; só o valor emprestado é de exemplo
    con.execute("UPDATE dividas SET valor_emprestado = 2200000, reconhecer_texto = 'JOSE VIEIRA' "
                "WHERE tipo = 'consignado'")
    con.execute("UPDATE dividas SET saldo_base = 345000, juros_mensal = 9.5, urgencia = 2, data_base = ? "
                "WHERE nome LIKE 'Nubank%'", (hoje_iso,))
    con.execute("INSERT INTO negociacoes (divida_id, data, texto) SELECT id, ?, ? FROM dividas WHERE nome LIKE 'Nubank%'",
                (hoje_iso, "Proposta do app: 12x de R$ 389,00 ou à vista R$ 2.150,00 (exemplo fictício)."))
    con.executemany("INSERT INTO metas (nome, faixa, valor_alvo, guardado, prazo, prioridade, criado_em) "
                    "VALUES (?,?,?,?,?,?,?)", [
                        ("Reserva de emergência", "alto", 1800000, 210000, somar_meses(hoje().strftime('%Y-%m'), 18), 1, hoje_iso),
                        ("Viagem de fim de ano", "medio", 450000, 120000, somar_meses(hoje().strftime('%Y-%m'), 8), 2, hoje_iso),
                        ("Cadeira de escritório", "baixo", 90000, 60000, somar_meses(hoje().strftime('%Y-%m'), 2), 3, hoje_iso),
                    ])
    db.definir_config(con, "limite_fatura_mensal", 300000)
    con.commit()
    r = atualizar(con, pasta)
    con.close()
    return r
