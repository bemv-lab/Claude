"""Testes do núcleo. Rodar com:  python -m unittest discover testes"""
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from nucleo import acoes, analises, categorizar, compartilhado, db, demo, dividas, planejamento, previstos, rendas, resumo  # noqa: E402
from nucleo.importacao import Lote, atualizar  # noqa: E402
from nucleo.importadores import csv_, ofx  # noqa: E402
from nucleo.util import chave_estabelecimento, detectar_parcela, hoje, parse_data, parse_valor, somar_meses  # noqa: E402


class TestUtil(unittest.TestCase):
    def test_valores(self):
        casos = {"-1.234,56": -123456, "R$ 1.234,56": 123456, "1234.56": 123456, "(12,30)": -1230,
                 "-R$ 50,00": -5000, "R$ -50,00": -5000, "12,30 D": -1230, "10": 1000, "0,5": 50, "abc": None}
        for txt, esperado in casos.items():
            self.assertEqual(parse_valor(txt), esperado, txt)

    def test_datas(self):
        self.assertEqual(parse_data("05/10/2026"), "2026-10-05")
        self.assertEqual(parse_data("2026-10-05"), "2026-10-05")
        self.assertEqual(parse_data("20261005120000[-3:BRT]"), "2026-10-05")
        self.assertEqual(parse_data("05/10/26"), "2026-10-05")
        self.assertIsNone(parse_data("Saldo"))

    def test_parcelas(self):
        self.assertEqual(detectar_parcela("MAGAZINE LUIZA PARC 03/10", True), (3, 10))
        self.assertEqual(detectar_parcela("LOJA - Parcela 2 de 6", False), (2, 6))
        self.assertEqual(detectar_parcela("CASAS BAHIA 04/12", True), (4, 12))
        self.assertIsNone(detectar_parcela("PIX ENVIADO 15/10", True))       # data, não parcela
        self.assertIsNone(detectar_parcela("CASAS BAHIA 04/12", False))      # solto só vale em cartão
        self.assertEqual(detectar_parcela("LOJA X", True, "Parcela 1/10"), (1, 10))

    def test_chave(self):
        self.assertEqual(chave_estabelecimento("Pix enviado - Maria Souza 12/09"), "MARIA SOUZA")
        self.assertEqual(chave_estabelecimento("IFOOD *RESTAURANTE X PARC 02/03"), "IFOOD RESTAURANTE")


class TestLeitores(unittest.TestCase):
    def test_ofx(self):
        conteudo = b"""OFXHEADER:100\nCHARSET:1252\n<OFX><CREDITCARDMSGSRSV1><CCSTMTRS><CCACCTFROM><ACCTID>9999
<BANKTRANLIST><STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261001<TRNAMT>-50.00<FITID>1<MEMO>UBER TRIP
</STMTTRN><STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261002<TRNAMT>100.00<FITID>2<NAME>PAGAMENTO
</STMTTRN></BANKTRANLIST></CCSTMTRS></CREDITCARDMSGSRSV1></OFX>"""
        r = ofx.ler(conteudo)
        self.assertTrue(r["cartao"])
        self.assertEqual(r["identificador"], "9999")
        self.assertEqual([(t["data"], t["valor"]) for t in r["transacoes"]], [("2026-10-01", -5000), ("2026-10-02", 10000)])

    def test_csv_inter_com_cabecalho_deslocado(self):
        conteudo = ("Extrato Conta Corrente\nConta ;123\n\nData Lançamento;Histórico;Descrição;Valor;Saldo\n"
                    "05/10/2026;Pix enviado;Fulano;-1.234,56;10,00\n06/10/2026;Pix recebido;Lucas;50,00;0\n").encode("utf-8-sig")
        r = csv_.ler(conteudo)
        self.assertNotIn("precisa_mapear", r)
        self.assertEqual(r["transacoes"][0]["descricao"], "Pix enviado - Fulano")
        self.assertEqual(r["transacoes"][0]["valor"], -123456)

    def test_csv_bb_tipo_lancamento(self):
        conteudo = ('"Data","Lançamento","Detalhes","N° documento","Valor","Tipo Lançamento"\n'
                    '"01/10/2026","Saldo Anterior","","","1200,00",""\n'
                    '"02/10/2026","Pix - Enviado","Fulano","1","50,00","Saída"\n').encode("cp1252")
        r = csv_.ler(conteudo)
        self.assertEqual(len(r["transacoes"]), 1)
        self.assertEqual(r["transacoes"][0]["valor"], -5000)

    def test_csv_desconhecido_pede_mapeamento(self):
        r = csv_.ler("Coisa;Grana;Quem\nMercado;-10,00;Lucas\n".encode())
        self.assertTrue(r["precisa_mapear"])
        self.assertEqual(r["cabecalho"], ["Coisa", "Grana", "Quem"])

    def test_csv_cabecalho_informal_reconhecido(self):
        r = csv_.ler("Quando;O quê;Quanto;Quem\n01/10/2026;Mercado;-10,00;Lucas\n".encode())
        self.assertEqual(r["transacoes"][0]["valor"], -1000)


class BaseBanco(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        self.con = db.conectar(self.dir / "t.db")

    def tearDown(self):
        self.con.close()
        self.tmp.cleanup()

    def conta(self, apelido):
        return self.con.execute("SELECT id FROM contas WHERE apelido = ?", (apelido,)).fetchone()["id"]

    def importar(self, nome, texto, apelido, enc="utf-8"):
        lote = Lote(self.con)
        lote.arquivo(texto.encode(enc), nome, self.conta(apelido))
        return lote.finalizar()


class TestPipeline(BaseBanco):
    FATURA = ('Data;Lançamento;Categoria;Tipo;Valor;Portador\n'
              '01/10/2026;IFOOD *SABOR;RESTAURANTES;Compra à vista;R$ 50,00;LUCAS F\n'
              '01/10/2026;IFOOD *SABOR;RESTAURANTES;Compra à vista;R$ 50,00;BARBARA M\n'
              '03/10/2026;MAGAZINE LUIZA;COMPRAS;Parcela 1/10;R$ 300,00;LUCAS F\n'
              '05/10/2026;PAGAMENTO ON LINE;;;-R$ 900,00;\n')

    def test_cadastro_inicial(self):
        self.assertEqual(self.con.execute("SELECT COUNT(*) FROM contas").fetchone()[0], 9)
        self.assertEqual(self.con.execute("SELECT COUNT(*) FROM dividas").fetchone()[0], 4)

    def test_fatura_sinal_portador_parcela_e_dedup(self):
        r = self.importar("f.csv", self.FATURA, "inter-cartao")
        self.assertEqual(r["novas"], 4)
        txs = [dict(t) for t in self.con.execute(
            "SELECT t.*, p.nome AS pessoa FROM transacoes t JOIN pessoas p ON p.id = t.pessoa_id ORDER BY t.id")]
        self.assertEqual([t["valor"] for t in txs], [-5000, -5000, -30000, 90000])   # duas compras iguais ficam
        self.assertEqual([t["pessoa"] for t in txs[:3]], ["Lucas", "Bárbara", "Lucas"])
        self.assertEqual((txs[2]["parcela_atual"], txs[2]["parcela_total"]), (1, 10))
        self.assertEqual(txs[3]["tipo"], "fatura")
        # mesmo conteúdo com uma linha a mais: só a linha nova entra
        r2 = self.importar("f2.csv", self.FATURA + "06/10/2026;UBER *TRIP;TRANSPORTE;Compra à vista;R$ 20,00;LUCAS F\n",
                           "inter-cartao")
        self.assertEqual((r2["novas"], r2["duplicadas"]), (1, 4))
        # alerta de parcelamento com renda futura comprometida
        a = self.con.execute("SELECT * FROM alertas WHERE tipo = 'parcelamento'").fetchone()
        self.assertIn("R$ 2.700,00", a["mensagem"])

    def test_transferencia_entre_contas(self):
        self.importar("i.csv", "Data;Descrição;Valor\n06/10/2026;PIX TRANSF BARBARA;-1.500,00\n", "itau")
        r = self.importar("n.csv", "Data;Histórico;Descrição;Valor\n06/10/2026;Pix recebido;Lucas F;1.500,00\n",
                          "inter-conta")
        self.assertEqual(r["transferencias"], 1)
        tipos = {t["tipo"] for t in self.con.execute("SELECT tipo FROM transacoes")}
        self.assertEqual(tipos, {"transferencia"})
        tot = analises.totais_mes(self.con, "2026-10")
        self.assertEqual((tot["receitas"], tot["despesas"]), (0, 0))

    def test_consignado_reconhecido(self):
        self.importar("i.csv", "Data;Descrição;Valor\n15/10/2026;Pix enviado - Jose;-680,00\n"
                               "02/10/2026;Pix enviado - Outro;-680,00\n", "inter-conta")
        pags = self.con.execute("SELECT * FROM pagamentos_divida").fetchall()
        self.assertEqual(len(pags), 1)                     # só o que caiu perto do dia 15
        self.assertEqual(pags[0]["data"], "2026-10-15")

    def test_aprende_com_a_fila(self):
        self.importar("i.csv", "Data;Descrição;Valor\n01/10/2026;Pix enviado - Dona Marta Silva;-250,00\n"
                               "01/09/2026;Pix enviado - Dona Marta Silva;-250,00\n", "bb")
        duv = self.con.execute("SELECT id FROM transacoes WHERE classificacao='duvida' ORDER BY id").fetchall()
        self.assertEqual(len(duv), 2)
        saude = db.categoria_id(self.con, "Saúde")
        r = categorizar.aprender(self.con, duv[0]["id"], saude)
        self.assertEqual(r["parecidos"], 1)
        self.importar("j.csv", "Data;Descrição;Valor\n01/11/2026;Pix enviado - Dona Marta Silva;-250,00\n", "bb")
        nova = self.con.execute("SELECT * FROM transacoes WHERE data = '2026-11-01'").fetchone()
        self.assertEqual((nova["categoria_id"], nova["classificacao"]), (saude, "regra"))

    def test_planilha_mapeada(self):
        pasta = self.dir / "entrada" / "planilha"
        pasta.mkdir(parents=True)
        (pasta / "antiga.csv").write_text("Data;Descrição;Valor;Conta;Quem;Categoria\n"
                                          "01/08/2026;Mercado do bairro;-120,00;Nubank;Lucas;Mercado\n"
                                          "02/08/2026;Salário;5.000,00;Itaú;Lucas;Salário\n", encoding="utf-8")
        r = atualizar(self.con, self.dir / "entrada")
        self.assertEqual(r["pendentes"][0]["status"], "precisa_mapear")
        mapa = {"data": 0, "descricao": [1], "valor": 2, "conta": 3, "pessoa": 4, "categoria": 5, "linha_cabecalho": 0}
        lote = Lote(self.con)
        lote.arquivo((pasta / "antiga.csv").read_bytes(), "antiga.csv", None, mapa=mapa)
        r = lote.finalizar()
        self.assertEqual(r["novas"], 2)
        linhas = self.con.execute("SELECT c.apelido, cat.nome FROM transacoes t JOIN contas c ON c.id=t.conta_id "
                                  "JOIN categorias cat ON cat.id=t.categoria_id ORDER BY t.data").fetchall()
        self.assertEqual([tuple(l) for l in linhas], [("nubank", "Supermercado"), ("itau", "Salário")])


class TestDividasReais(BaseBanco):
    def divida(self, filtro):
        d = self.con.execute(f"SELECT * FROM dividas WHERE {filtro}").fetchone()
        return dividas.estado(self.con, d)

    def test_consignado_cadastrado(self):
        e = self.divida("tipo = 'consignado'")
        self.assertEqual((e["parcelas_restantes_atual"], e["saldo_atual"]), (31, 2108000))
        self.assertEqual((e["parcelas_pagas"], e["termino"]), (17, "2029-05"))

    def test_consignado_abate_por_mes(self):
        # outubro pago com 1 dia de atraso já está nas 17 pagas; novembro abate
        self.importar("i.csv", "Data;Descrição;Valor\n16/10/2026;Pix enviado - Pai;-680,00\n"
                               "14/11/2026;Pix enviado - Pai;-680,00\n", "inter-conta")
        e = self.divida("tipo = 'consignado'")
        self.assertEqual(len(e["pagamentos"]), 2)
        self.assertEqual((e["parcelas_restantes_atual"], e["saldo_atual"], e["termino"]), (30, 2040000, "2029-05"))

    def test_taxa_implicita_e_quitacao(self):
        self.con.execute("UPDATE dividas SET valor_emprestado = 2200000 WHERE tipo = 'consignado'")
        e = self.divida("tipo = 'consignado'")
        self.assertAlmostEqual(e["taxa_implicita"], 1.741, places=2)
        self.assertEqual(e["juros_contrato"], 48 * 68000 - 2200000)
        self.assertLess(e["quitar_hoje"]["pagar_hoje"], 2108000)
        self.assertIsNone(dividas.taxa_implicita(0, 68000, 48))
        self.assertEqual(dividas.taxa_implicita(3264000, 68000, 48), 0.0)

    def test_metaeds_no_cartao(self):
        e = self.divida("nome = 'MetaEds'")
        self.assertEqual(e["saldo_atual"], 200000)
        from nucleo import alertas
        alertas.gerar(self.con)
        a = self.con.execute("SELECT * FROM alertas WHERE tipo = 'pagamento_cartao'").fetchone()
        self.assertIsNotNone(a)
        self.assertIn("simulem", (a["titulo"] + a["acao"]).lower())
        # passou no cartão: vira pagamento, sai do saldo e o alerta lembra da fatura inteira
        self.importar("f.csv", "Data;Lançamento;Valor\n24/10/2026;METAEDS CURSOS;R$ 2.000,00\n", "inter-cartao")
        e = self.divida("nome = 'MetaEds'")
        self.assertEqual(e["saldo_atual"], 0)
        a = self.con.execute("SELECT * FROM alertas WHERE tipo = 'pagamento_cartao' AND ativo = 1").fetchone()
        self.assertIn("20/11/2026", a["titulo"])

    def test_migracao_de_banco_antigo(self):
        caminho = self.dir / "antigo.db"
        con = db.conectar(caminho)
        con.execute("UPDATE dividas SET parcelas_restantes = NULL, parcelas_total = NULL WHERE tipo = 'consignado'")
        con.execute("UPDATE dividas SET saldo_base = NULL WHERE nome = 'MetaEds'")
        con.execute("UPDATE dividas SET observacao = 'editado' WHERE tipo = 'familia'")
        con.execute("UPDATE config SET valor = '1' WHERE chave = 'versao_dados'")
        con.execute("DELETE FROM config_alertas WHERE tipo = 'pagamento_cartao'")
        con.commit(); con.close()
        con = db.conectar(caminho)
        r = con.execute("SELECT parcelas_restantes, parcelas_total FROM dividas WHERE tipo='consignado'").fetchone()
        self.assertEqual(tuple(r), (31, 48))
        self.assertEqual(con.execute("SELECT saldo_base FROM dividas WHERE nome='MetaEds'").fetchone()[0], 200000)
        self.assertEqual(con.execute("SELECT observacao FROM dividas WHERE tipo='familia'").fetchone()[0], "editado")
        self.assertTrue(con.execute("SELECT 1 FROM config_alertas WHERE tipo='pagamento_cartao'").fetchone())
        con.close()


class TestDividas(unittest.TestCase):
    def test_cartao_sem_rotativo(self):
        r = dividas.simular_cartao(120000, 200000, None, 14.5)
        self.assertFalse(r["alerta"])
        self.assertEqual(r["custo_1_mes"], 0)

    def test_cartao_com_rotativo(self):
        r = dividas.simular_cartao(120000, 200000, 250000, 14.5)
        self.assertTrue(r["alerta"])
        self.assertEqual(r["rotativo"], 70000)
        self.assertGreater(r["custo_1_mes"], 10000)
        self.assertLessEqual(r["custo_12_meses"], 70000)   # teto legal de 100%

    def test_antecipacao(self):
        r = dividas.simular_antecipacao(68000, 18, 1.8, 3)
        self.assertEqual(r["nominal"], 204000)
        self.assertTrue(0 < r["economia"] < 204000)
        self.assertEqual(dividas.simular_antecipacao(68000, 18, 0, 3)["economia"], 0)


class TestDemo(unittest.TestCase):
    def test_demo_completo(self):
        with tempfile.TemporaryDirectory() as t:
            r = demo.criar(Path(t) / "d.db", Path(t) / "ent")
            self.assertGreater(r["novas"], 100)
            self.assertGreaterEqual(r["transferencias"], 3)
            self.assertGreaterEqual(r["pagamentos_divida"], 1)
            con = db.conectar(Path(t) / "d.db")
            h = resumo.home(con)
            self.assertFalse(h["vazio"])
            self.assertTrue(any(a["tipo"] == "parcelamento" for a in h["alertas"]))
            json.dumps(h)          # a API precisa conseguir serializar
            con.close()


if __name__ == "__main__":
    unittest.main()


# ---------------------------------------------------------------- formatos e planilha (dados fictícios)

def fazer_xlsx(abas: dict) -> bytes:
    """xlsx mínimo: textos inline, números, e datas (date) com estilo de data."""
    import io
    import zipfile
    from datetime import date as _date
    from xml.sax.saxutils import escape

    def col(i):
        s = ""
        i += 1
        while i:
            i, r = divmod(i - 1, 26)
            s = chr(65 + r) + s
        return s
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        sheets, rels = [], []
        for n, (nome, linhas) in enumerate(abas.items(), 1):
            xml_linhas = []
            for i, linha in enumerate(linhas, 1):
                cels = []
                for j, v in enumerate(linha):
                    ref = f"{col(j)}{i}"
                    if v is None:
                        continue
                    if isinstance(v, _date):
                        serial = (v - _date(1899, 12, 30)).days
                        cels.append(f'<c r="{ref}" s="1"><v>{serial}</v></c>')
                    elif isinstance(v, (int, float)):
                        cels.append(f'<c r="{ref}"><v>{v}</v></c>')
                    else:
                        cels.append(f'<c r="{ref}" t="inlineStr"><is><t>{escape(str(v))}</t></is></c>')
                xml_linhas.append(f'<row r="{i}">{"".join(cels)}</row>')
            z.writestr(f"xl/worksheets/sheet{n}.xml",
                       '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
                       + "".join(xml_linhas) + "</sheetData></worksheet>")
            sheets.append(f'<sheet name="{escape(nome)}" sheetId="{n}" r:id="rId{n}"/>')
            rels.append(f'<Relationship Id="rId{n}" Type="worksheet" Target="worksheets/sheet{n}.xml"/>')
        z.writestr("xl/workbook.xml", '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
                   'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
                   + "".join(sheets) + "</sheets></workbook>")
        z.writestr("xl/_rels/workbook.xml.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/'
                   '2006/relationships">' + "".join(rels) + "</Relationships>")
        z.writestr("xl/styles.xml", '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
                   '<cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>')
    return buf.getvalue()


class TestFormatos(BaseBanco):
    def test_xlsx_do_bb_como_extrato(self):
        from nucleo.importadores import xlsx
        conteudo = fazer_xlsx({"Extrato Conta": [
            ["Data", "Lançamento", "Detalhes", "N° documento", "Valor", "Tipo Lançamento"],
            ["30/06/2026", "Saldo Anterior", "", "", "0,00", ""],
            ["02/07/2026", "Pix - Enviado", "02/07 10:56 ENERGISA", "70202", "-231,19", "Saída"],
            ["02/07/2026", "BB Rende Fácil", "Rende Facil", "9903", "231,19", "Entrada"],
            ["26/08/2026", "Pagto cartão crédito", "ELO MAIS", "1", "-862,00", "Saída"],
            ["26/08/2026", "Estorno de Débito", "ELO MAIS", "1", "862,00", "Entrada"],
            ["31/07/2026", "S A L D O", "", "", "0,00", ""]]})
        self.assertTrue(xlsx.eh_xlsx(conteudo))
        lote = Lote(self.con)
        r = lote.arquivo(conteudo, "bb.xlsx", self.conta("bb"))
        lote.finalizar()
        self.assertEqual(r["novas"], 4)
        tipos = dict(self.con.execute("SELECT descricao, tipo FROM transacoes").fetchall())
        self.assertEqual(tipos["BB Rende Fácil - Rende Facil"], "investimento")
        self.assertEqual(tipos["Estorno de Débito - ELO MAIS"], "transferencia")
        self.assertEqual(tipos["Pagto cartão crédito - ELO MAIS"], "fatura")
        cat = self.con.execute("SELECT c.nome FROM transacoes t JOIN categorias c ON c.id = t.categoria_id "
                               "WHERE t.descricao LIKE '%ENERGISA%'").fetchone()[0]
        self.assertEqual(cat, "Energia")
        tot = analises.totais_mes(self.con, "2026-08")       # o débito devolvido não vira gasto nem renda
        self.assertEqual((tot["receitas"], tot["despesas"]), (0, 0))

    def test_pdf_itau_texto(self):
        from nucleo.importadores import pdf_itau
        texto = ("FULANO DE TAL 000.000.000-00 agência: 1234 conta: 012345-6\nextrato conta / lançamentos\n"
                 "período de visualização: 25/07/2026 até 23/10/2026 emitido em: 23/10/2026\n"
                 "data lançamentos valor (R$) saldo (R$)\n17/10/2026 SALDO DO DIA 0,00\n"
                 "16/10/2026 PIX TRANSF FULANO16/10 -596,29\n15/10/2026 REMUNERACAO/SALARIO HP06 1.127,63\n")
        r = pdf_itau.ler_texto(texto)
        self.assertEqual(r["identificador"], "012345-6")
        self.assertEqual(r["periodo"], ("2026-07-25", "2026-10-23"))
        self.assertEqual([(t["data"], t["valor"], t["descricao"]) for t in r["transacoes"]],
                         [("2026-10-16", -59629, "PIX TRANSF FULANO"), ("2026-10-15", 112763, "REMUNERACAO/SALARIO HP06")])
        self.assertEqual(pdf_itau.ler_texto("outro pdf qualquer"), {})

    def test_pix_para_o_proprio_titular_e_transferencia(self):
        self.importar("i.csv", "Data;Descrição;Valor\n14/08/2026;PIX TRANSF LUCAS V;-1.127,63\n"
                               "14/08/2026;PIX TRANSF MARIA X;-50,00\n", "itau")
        tipos = dict(self.con.execute("SELECT descricao, tipo FROM transacoes").fetchall())
        self.assertEqual(tipos["PIX TRANSF LUCAS V"], "transferencia")      # conta do Lucas para o Lucas
        self.assertEqual(tipos["PIX TRANSF MARIA X"], "normal")

    def test_parcelas_com_centavos_diferentes_sao_a_mesma_compra(self):
        self.importar("f.csv", "Data;Lançamento;Tipo;Valor\n08/10/2026;LOJA CASA NOVA;Parcela 1/10;R$ 73,22\n"
                               "08/11/2026;LOJA CASA NOVA;Parcela 2/10;R$ 73,15\n", "inter-cartao")
        gs = analises.parcelamentos(self.con)
        self.assertEqual(len(gs), 1)
        self.assertEqual(len(gs[0]["ocorrencias"]), 10)                  # 2 lançadas + 8 por vir
        self.assertEqual(gs[0]["pagas"] + gs[0]["faltam"], 10)


class TestPlanilha(BaseBanco):
    CAB = ["Data", "Descrição", "Categoria", "Valor", "Forma de Pagamento", "Tipo", "Parcela", "Total de Parcelas"]

    def versao(self, linhas):
        from datetime import date as d
        return fazer_xlsx({
            "Val.Dados": [["Custo", "Categoria", "Forma de Pgto"], ["Fixo", "Aluguel", "Inter Cartão"]],
            "Lançamentos": [self.CAB] + linhas,
            "Orçamento": [["Tipo de Custo", "Categoria", "Orçado (Mensal)"], ["Variável", "Supermercado", 1200.0],
                          [None, "Total", 1200.0]],
            "Pagamentos": [[None, "Prioridade", "Credor", "Valor Devido"], [None, 1.0, "Fulano", 100.0]]})

    def test_versoes_mensais_somadas(self):
        from datetime import date as d
        jul = self.versao([
            [d(2026, 6, 20), "Bemais", "Supermercado", 50.0, "Inter Cartão", "Despesa", "Única", None],
            [d(2026, 5, 10), "Loja X", "Vestuário", 100.0, "Inter Cartão", "Despesa", 3.0, 6.0],
            [d(2025, 7, 25), "Compra velha", "Extras", 40.0, "C6 Cartão", "Despesa", 8.0, 9.0],
            [d(2026, 7, 20), "Aluguel", "Transf. Contas", 2900.0, "Inter Conta", "Despesa", "Única", None]])
        ago = self.versao([
            [d(2026, 6, 20), "Bemais", "Supermercado", 50.0, "Inter Cartão", "Despesa", "Única", None],
            [d(2026, 5, 10), "Loja X", "Vestuário", 100.0, "Inter Cartão", "Despesa", 3.0, 6.0]])
        pasta = self.dir / "entrada"
        (pasta / "planilha").mkdir(parents=True)
        (pasta / "planilha" / "Controle_Financeiro_7._Julho_26.xlsx").write_bytes(jul)
        (pasta / "planilha" / "Controle_Financeiro_8._Agosto_26.xlsx").write_bytes(ago)
        (pasta / "inter-conta").mkdir()
        (pasta / "inter-conta" / "x.csv").write_text("Data;Descrição;Valor\n20/07/2026;Pix enviado - Fulano Locador;-2.900,00\n")
        r = atualizar(self.con, pasta)
        self.assertEqual(r["planilha"]["parcelas_paradas"], 1)                  # "Compra velha" de 2025
        linhas = self.con.execute("SELECT t.data, t.descricao FROM transacoes t JOIN contas c ON c.id = t.conta_id "
                                  "WHERE c.apelido = 'inter-cartao' ORDER BY t.data").fetchall()
        # à vista entra uma vez; a parcela que aparece nas duas versões é de dois meses (jul e ago)
        self.assertEqual([tuple(l) for l in linhas],
                         [("2026-06-20", "Bemais"), ("2026-07-10", "Loja X"), ("2026-08-10", "Loja X")])
        self.assertEqual(self.con.execute("SELECT orcamento FROM categorias WHERE nome = 'Supermercado'").fetchone()[0], 120000)
        self.assertTrue(self.con.execute("SELECT 1 FROM regras WHERE padrao = 'BEMAIS' AND origem = 'aprendida'").fetchone())
        # "Aluguel" lançado como Transf. Contas ensina a categoria Aluguel para o Pix do extrato
        cat = self.con.execute("SELECT c.nome FROM transacoes t JOIN categorias c ON c.id = t.categoria_id "
                               "WHERE t.descricao LIKE '%Locador%'").fetchone()[0]
        self.assertEqual(cat, "Aluguel")
        # rodar de novo não duplica
        self.assertEqual(atualizar(self.con, pasta)["novas"], 0)


class TestFaturaVsPlanilha(BaseBanco):
    def test_fatura_vale_no_periodo_dela_e_planilha_empresta_categoria(self):
        from datetime import date as d
        db.definir_config(self.con, "faturas_inter", '["2026-10"]')
        pasta = self.dir / "entrada"
        (pasta / "inter-cartao").mkdir(parents=True)
        (pasta / "inter-cartao" / "fatura.csv").write_text(
            "Data;Lançamento;Tipo;Valor\n21/09/2026;BLUEFIT LIVMALL;Compra;R$ 169,90\n"
            "20/09/2026;LA PLAYA BAR E RESTAUR;Compra;R$ 72,00\n", encoding="utf-8")
        (pasta / "planilha").mkdir()
        cab = TestPlanilha.CAB
        (pasta / "planilha" / "Controle_Financeiro_10._Outubro_26.xlsx").write_bytes(fazer_xlsx({
            "Val.Dados": [["Custo", "Categoria"]], "Lançamentos": [cab,
                [d(2026, 9, 20), "La playa", "Lazer", 72.0, "Inter Cartão", "Despesa", "Única", None],
                [d(2026, 9, 22), "Ajuste antigo", "Extras", 10.0, "Inter Cartão", "Despesa", "Única", None],
                [d(2026, 8, 20), "Compra de agosto", "Extras", 30.0, "Inter Cartão", "Despesa", "Única", None]],
            "Orçamento": [["Tipo"]], "Pagamentos": [["x"]]}))
        r = atualizar(self.con, pasta)
        self.assertEqual(r["planilha"]["na_fatura"], 2)        # dentro da janela 14/09-13/10: não entram
        linhas = dict(self.con.execute(
            "SELECT t.descricao, c.nome FROM transacoes t LEFT JOIN categorias c ON c.id = t.categoria_id").fetchall())
        self.assertEqual(linhas["LA PLAYA BAR E RESTAUR"], "Lazer")   # categoria veio da planilha
        self.assertNotIn("Ajuste antigo", linhas)
        self.assertIn("Compra de agosto", linhas)                    # fora da janela: a planilha completa


class TestPlanejamento(BaseBanco):
    """Fase 2: orçamento realista, projeção e plano de quitação, sobre três meses completos."""

    def lancar(self, meses_atras, categoria, valor, apelido="inter-conta", **extra):
        mes = somar_meses(hoje().strftime("%Y-%m"), -meses_atras)
        n = self.con.execute("SELECT COUNT(*) FROM transacoes").fetchone()[0]
        campos = {"conta_id": self.conta(apelido), "data": f"{mes}-10", "descricao": categoria, "valor": valor,
                  "categoria_id": db.categoria_id(self.con, categoria), "tipo": "normal", "classificacao": "manual",
                  "chave": categoria.upper(), "mes_ref": mes,
                  "hash": f"t{n}", "criado_em": "2026-01-01", **extra}
        self.con.execute(f"INSERT INTO transacoes ({', '.join(campos)}) VALUES ({', '.join('?' * len(campos))})",
                         tuple(campos.values()))

    def setUp(self):
        super().setUp()
        rendas.criar(self.con, {"descricao": "Salário", "padrao": "SALARIO", "dia": 15, "valor": 900000, "inicio": "2026-01"})
        for k, (aluguel, restaurante) in enumerate([(290000, 10000), (290000, 30000), (580000, 20000)], 1):
            self.lancar(k, "Salário", 900000)
            self.lancar(k, "Aluguel", -aluguel)             # mês da mudança: dois aluguéis
            self.lancar(k, "Restaurante", -restaurante)
        self.lancar(2, "Lazer", -30000)                        # esporádico
        self.lancar(1, "Supermercado", -60000, apelido="flash")  # pago com benefício
        self.con.commit()

    def test_projecao_mediana_nas_essenciais_e_media_no_resto(self):
        p = planejamento.projecao(self.con, 3)
        self.assertEqual(p["renda"]["valor"], 900000)
        self.assertEqual(p["dia_a_dia"], 290000 + 20000 + 10000)      # aluguel pela mediana; flash fora
        consignado = dividas.painel(self.con)["mensal_comprometido"]
        self.assertEqual(p["meses"][0]["resultado"], 900000 - 320000 - consignado)
        self.assertEqual(p["meses"][2]["acumulado"], sum(m["resultado"] for m in p["meses"]))

    def test_orcamento_inclui_flash_e_corta_so_o_que_e_escolha(self):
        o = planejamento.orcamento_sugerido(self.con, liberar=1000000)
        itens = {i["nome"]: i for i in o["itens"]}
        self.assertEqual(itens["Supermercado"]["tipico"], 20000)       # média com o Flash, como na Início
        self.assertEqual(itens["Aluguel"]["sugestao"], 290000)          # essencial: não corta
        self.assertEqual(itens["Supermercado"]["corte"], 0)             # gastar menos do Flash não libera dinheiro
        self.assertLessEqual(itens["Restaurante"]["corte"], 20000 * 0.3)
        self.assertGreater(o["falta_depois_do_corte"], 0)               # R$ 10 mil não cabem só em corte

    def test_corte_bate_o_alvo_sem_sobrar(self):
        self.lancar(1, "Extras", -100000)
        self.lancar(2, "Extras", -100000)
        self.lancar(3, "Extras", -100000)
        o = planejamento.orcamento_sugerido(self.con, liberar=10000)
        self.assertGreaterEqual(o["corte_sugerido"], 10000)
        self.assertLess(o["corte_sugerido"], 10000 + 1000)
        self.assertEqual(o["falta_depois_do_corte"], 0)

    def test_aplicar_orcamento(self):
        rest = db.categoria_id(self.con, "Restaurante")
        total = planejamento.aplicar_orcamento(self.con, [{"id": rest, "orcamento": 15000}])
        self.assertEqual(self.con.execute("SELECT orcamento FROM categorias WHERE id = ?", (rest,)).fetchone()[0], 15000)
        self.assertEqual(db.config_int(self.con, "orcamento_mensal"), total)

    def test_quitacao_extra_e_teto_de_juros_do_cartao(self):
        self.con.execute("INSERT INTO dividas (nome, tipo, status, saldo_base, data_base, criado_em) "
                         "VALUES ('Cartão X', 'cartao', 'ativa', 100000, ?, '2026-01-01')", (hoje().isoformat(),))
        self.con.commit()
        sem = planejamento.plano_quitacao(self.con, 0, bola_de_neve=False)
        x = next(d for d in sem["dividas"] if d["nome"] == "Cartão X")
        self.assertIsNone(x["quitada_em"])
        self.assertTrue(x["juros_estimado"])
        self.assertLessEqual(x["juros_pagos"], 100000)                  # Lei 14.690: juros até 100% do original
        com = planejamento.plano_quitacao(self.con, 50000)
        x = next(d for d in com["dividas"] if d["nome"] == "Cartão X")
        self.assertIsNotNone(x["quitada_em"])                            # sem juros informados: não inventamos taxa
        self.assertEqual(x["juros_pagos"], 0)
        self.assertEqual(com["dividas"][-1]["nome"], "Cartão X")        # sem previsão de pagamento: por último


class TestRevisao(TestPlanejamento):
    """Revisão de 25/10: fatura, previstos, marketplace, plano de ação e regras manuais."""

    def test_parcela_cai_no_mes_da_fatura(self):
        cartao = dict(self.con.execute("SELECT * FROM contas WHERE apelido = 'inter-cartao'").fetchone())
        self.assertEqual(analises.mes_da_fatura(cartao, "2026-10-12"), "2026-10")    # até o corte (13)
        self.assertEqual(analises.mes_da_fatura(cartao, "2026-10-16"), "2026-11")    # depois do corte
        conta = dict(self.con.execute("SELECT * FROM contas WHERE apelido = 'inter-conta'").fetchone())
        self.assertEqual(analises.mes_da_fatura(conta, "2026-10-16"), "2026-10")

    def test_previsto_manual_e_ajuste_de_automatico(self):
        mes = hoje().strftime("%Y-%m")
        previstos.salvar(self.con, {"mes": mes, "descricao": "Freela", "valor": 50000})
        d = previstos.do_mes(self.con, mes)
        self.assertGreaterEqual(d["a_receber"], 50000)
        renda = next(i for i in d["itens"] if i["origem"] == "renda")
        previstos.salvar(self.con, {"chave_auto": renda["chave_auto"], "mes": mes, "descricao": "x", "valor": 0,
                                    "status": "cancelado"})
        d2 = previstos.do_mes(self.con, mes)
        self.assertEqual(next(i for i in d2["itens"] if i["chave_auto"] == renda["chave_auto"])["status"], "cancelado")
        self.assertLess(d2["a_receber"], d["a_receber"] + 1)
        # previsto fora da rotina entra na projeção do Plano
        prox = somar_meses(mes, 1)
        base = planejamento.projecao(self.con, 1)["meses"][0]["resultado"]
        previstos.salvar(self.con, {"mes": prox, "descricao": "IPVA", "valor": -120000})
        self.assertEqual(planejamento.projecao(self.con, 1)["meses"][0]["resultado"], base - 120000)

    def test_orcamento_e_soma_das_categorias(self):
        o = resumo.orcamento(self.con, hoje().strftime("%Y-%m"))
        soma = self.con.execute("SELECT COALESCE(SUM(orcamento),0) FROM categorias WHERE tipo='despesa' AND ativa=1").fetchone()[0]
        self.assertEqual(o["limite"], soma)

    def test_marketplace_e_produto_em_todas_as_parcelas(self):
        self.assertTrue(analises.eh_marketplace("AMAZONMKTPLC*REPSTOREL"))
        self.assertTrue(analises.eh_marketplace("MERCADOLIVRE*MERCADOL"))
        self.assertFalse(analises.eh_marketplace("AmazonPrimeBR"))
        self.assertFalse(analises.eh_marketplace("PADARIA SAO JOAO"))
        self.importar("f.csv", "Data;Lançamento;Tipo;Valor\n08/10/2026;AMAZON BR;Parcela 1/3;R$ 30,00\n"
                               "08/11/2026;AMAZON BR;Parcela 2/3;R$ 30,00\n", "inter-cartao")
        tx = self.con.execute("SELECT id FROM transacoes WHERE descricao = 'AMAZON BR' ORDER BY data").fetchone()["id"]
        self.assertEqual(analises.salvar_produto(self.con, tx, "Fone de ouvido"), 2)
        self.assertEqual(analises.compras_marketplace(self.con, so_sem_produto=True), [])

    def test_compromisso_de_nao_gastar(self):
        h = hoje()
        aid = acoes.criar_acao(self.con, {"texto": "Não comprar roupas", "categoria_id": db.categoria_id(self.con, "Vestuário"),
                                          "limite": 0, "inicio": h.replace(day=1).isoformat(), "fim": h.isoformat()})
        a = acoes.acoes_ativas(self.con)[0]
        self.assertEqual(a["situacao"], "cumprindo")
        self.lancar(0, "Vestuário", -8000)                       # dia 10 do mês atual
        self.con.commit()
        a = next(x for x in acoes.acoes_ativas(self.con) if x["id"] == aid)
        self.assertEqual(a["situacao"], "quebrou" if h.day >= 10 else "cumprindo")
        acoes.registrar(self.con, aid, "nao_cumprida", "Promoção")
        self.assertEqual(acoes.acoes_ativas(self.con), [])
        an = acoes.analise(self.con)
        self.assertIn("pioraram", an)

    def test_regra_de_voces_vence_a_planilha(self):
        self.lancar(1, "Lazer", -2090, descricao="Netflix", chave="NETFLIX", classificacao="importada")
        self.con.execute("INSERT INTO regras (padrao, categoria_id, origem, criado_em) VALUES ('NETFLIX', ?, 'manual', '')",
                         (db.categoria_id(self.con, "Assinaturas"),))
        self.con.commit()
        self.assertGreaterEqual(categorizar.reaplicar_manuais(self.con), 1)
        cat = self.con.execute("SELECT c.nome FROM transacoes t JOIN categorias c ON c.id = t.categoria_id "
                               "WHERE t.descricao = 'Netflix'").fetchone()[0]
        self.assertEqual(cat, "Assinaturas")


class TestRendas(BaseBanco):
    """Entradas fixas: ligadas ao extrato pelo texto e pelo dia; mudanças valem a partir de um mês."""

    def entrada(self, data, valor, descricao, apelido="itau"):
        n = self.con.execute("SELECT COUNT(*) FROM transacoes").fetchone()[0]
        self.con.execute("""INSERT INTO transacoes (conta_id, data, descricao, chave, valor, categoria_id, tipo,
                            classificacao, hash, mes_ref, criado_em)
                            VALUES (?,?,?,?,?,?, 'normal', 'manual', ?, ?, '2026-01-01')""",
                         (self.conta(apelido), data, descricao, descricao.upper(), valor,
                          db.categoria_id(self.con, "Salário"), f"r{n}", data[:7]))
        self.con.commit()

    def test_liga_o_extrato_pelo_texto_e_pelo_dia(self):
        rendas.criar(self.con, {"descricao": "Lucas · adiantamento", "padrao": "REMUNERACAO/SALARIO", "dia": 15,
                                "valor": 112500, "inicio": "2026-07"})
        rendas.criar(self.con, {"descricao": "Lucas · restante", "padrao": "REMUNERACAO/SALARIO", "dia": 30,
                                "valor": 141500, "inicio": "2026-07"})
        self.entrada("2026-08-14", 112763, "REMUNERACAO/SALARIO HP06")
        self.entrada("2026-08-31", 123058, "REMUNERACAO/SALARIO HP01")
        por_dia = {r["dia"]: r for r in rendas.do_mes(self.con, "2026-08")}
        self.assertEqual(por_dia[15]["status"], "recebido")
        self.assertEqual(por_dia[30]["status"], "parcial")          # mês passado, recebeu menos
        self.assertEqual(por_dia[30]["recebido"], 123058)

    def test_mes_futuro_mostra_o_que_falta(self):
        mes = somar_meses(hoje().strftime("%Y-%m"), 1)
        rendas.criar(self.con, {"descricao": "Salário", "padrao": "SALARIO", "dia": 15, "valor": 650000, "inicio": "2026-07"})
        r = rendas.do_mes(self.con, mes)[0]
        self.assertEqual((r["status"], r["falta"]), ("a_receber", 650000))

    def test_mudanca_de_valor_vale_a_partir_do_mes(self):
        rid = rendas.criar(self.con, {"descricao": "Salário", "padrao": "SALARIO", "dia": 15, "valor": 650000,
                                      "inicio": "2026-07"})
        rendas.alterar(self.con, rid, {"valor": 700000}, a_partir="2026-10")
        self.assertEqual(rendas.valor_mes(self.con, "2026-09"), 650000)
        self.assertEqual(rendas.valor_mes(self.con, "2026-10"), 700000)
        ativa = rendas.ativas(self.con, "2026-11")[0]["id"]          # a linha que vale em novembro
        rendas.encerrar(self.con, ativa, a_partir="2026-12")
        self.assertEqual(rendas.valor_mes(self.con, "2026-12"), 0)
        self.assertEqual(rendas.valor_mes(self.con, "2026-11"), 700000)


class TestResolvidosContam(BaseBanco):
    """Marcar uma entrada como recebida (sem lançamento no extrato) não pode fazê-la sumir do resultado."""

    def test_recebido_sem_extrato_entra_nas_entradas(self):
        mes = "2026-10"
        con = self.con
        rid = rendas.criar(con, {"descricao": "Salário Teste", "padrao": "NAO EXISTE", "valor": 100000, "dia": 15,
                                 "a_partir": mes})
        antes = resumo.home(con, mes)
        previstos.salvar(con, {"mes": mes, "chave_auto": f"renda:{rid}", "status": "realizado",
                               "descricao": "Salário Teste", "valor": 100000})
        depois = resumo.home(con, mes)
        self.assertEqual(depois["entradas"]["recebido"], antes["entradas"]["recebido"] + 100000)
        self.assertEqual(depois["saldo_previsto"], antes["saldo_previsto"])
        ligada = [x for x in rendas.do_mes(con, mes) if x["id"] == rid][0]
        self.assertEqual((ligada["status"], ligada["recebido"]), ("recebido", 100000))


class TestCompartilhado(unittest.TestCase):
    """Dois computadores na mesma pasta do Drive: só um edita; o outro consulta uma cópia."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.pasta = self.tmp / "drive"
        self.pasta.mkdir()
        self.banco = self.pasta / "financas.db"
        db.conectar(self.banco).close()
        self.lucas = compartilhado.Uso(self.pasta, "Lucas", self.banco, self.tmp / "l" / "consulta.db")
        self.barbara = compartilhado.Uso(self.pasta, "Bárbara", self.banco, self.tmp / "b" / "consulta.db")

    def test_um_edita_outro_consulta(self):
        self.assertEqual(self.lucas.avaliar(forcar=True), "edicao")
        self.assertEqual(self.barbara.avaliar(forcar=True), "consulta")
        self.assertIn("Lucas", self.barbara.motivo)
        self.assertEqual(self.barbara.banco_para_ler(), self.tmp / "b" / "consulta.db")
        self.lucas.liberar()
        self.assertEqual(self.barbara.avaliar(forcar=True), "edicao")
        self.assertEqual(self.barbara.banco_para_ler(), self.banco)
        self.assertEqual(self.lucas.avaliar(forcar=True), "consulta")

    def test_espera_o_drive_trazer_a_ultima_versao(self):
        self.lucas.avaliar(forcar=True)
        con = db.conectar(self.banco)
        self.lucas.editou(compartilhado.subir_versao(con))
        con.close()
        self.lucas.liberar()
        # o arquivo de trava chegou, mas o banco ainda é o antigo: simula voltando o contador
        con = db.conectar(self.banco)
        con.execute("UPDATE config SET valor = '0' WHERE chave = 'versao_edicao'")
        con.commit()
        con.close()
        self.assertEqual(self.barbara.avaliar(forcar=True), "consulta")
        self.assertIn("Google Drive", self.barbara.motivo)

    def test_batida_velha_libera(self):
        self.lucas.avaliar(forcar=True)
        t = json.loads((self.pasta / "em-uso.json").read_text(encoding="utf-8"))
        t["batida"] = "2000-01-01T00:00:00"
        (self.pasta / "em-uso.json").write_text(json.dumps(t), encoding="utf-8")
        self.assertEqual(self.barbara.avaliar(forcar=True), "edicao")

    def test_sem_pasta_sempre_edita(self):
        u = compartilhado.Uso(None, "x", self.banco, self.tmp / "c.db")
        self.assertEqual(u.avaliar(forcar=True), "edicao")
        self.assertEqual(u.banco_para_ler(), self.banco)
