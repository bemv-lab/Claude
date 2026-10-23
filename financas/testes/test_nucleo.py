"""Testes do núcleo. Rodar com:  python -m unittest discover testes"""
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from nucleo import analises, categorizar, db, demo, dividas, resumo  # noqa: E402
from nucleo.importacao import Lote, atualizar  # noqa: E402
from nucleo.importadores import csv_, ofx  # noqa: E402
from nucleo.util import chave_estabelecimento, detectar_parcela, parse_data, parse_valor  # noqa: E402


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
        self.assertEqual((gs[0]["parcela_atual"], gs[0]["faltam"]), (2, 8))


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
