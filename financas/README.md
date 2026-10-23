# Parceiro de Prosperidade · finanças do casal

Sistema local de finanças pessoais da Bárbara e do Lucas. Roda só no computador de vocês,
sem custo, sem agregador e sem senha de banco. Estamos na **Fase 1 (MVP)**.

## Como rodar

Precisa só do **Python 3.10 ou mais novo**. A única instalação opcional é para ler o extrato do Itaú,
que o app só entrega em PDF: `pip install pdfplumber` (uma vez).

```bash
cd financas
python app.py            # abre http://localhost:8765 no navegador
python app.py --demo     # abre direto no modo demo (dados fictícios)
python app.py --rede     # libera para o celular no mesmo Wi-Fi; mostra o endereço e um PIN
```

No Windows, use `py app.py` se `python` não funcionar.

Outros comandos:

```bash
python importar.py                        # importa o que estiver em entrada/ e mostra o resumo
python importar.py --demo                 # recria o banco de demonstração
python backup.py "G:/Meu Drive/Financas"  # cópia do banco (guarda as 30 mais recentes)
python -m unittest discover testes        # testes automáticos
```

## Fluxo do dia a dia

1. Baixem o extrato no app de cada banco: OFX de preferência; CSV e Excel (.xlsx) também servem;
   o Itaú só oferece PDF, que também é lido.
2. Salvem em `entrada/<conta>/` ou arrastem para a tela **Importar**.
3. Toquem em **Atualizar** (ou `python importar.py`): importa, ignora duplicados, categoriza,
   reconhece transferências entre vocês, pagamento de fatura e o consignado, e gera alertas.
4. Abram a **Fila de dúvidas** e classifiquem com um clique. O sistema cria a regra e
   classifica os parecidos sozinho, agora e nas próximas importações.

| Pasta em `entrada/` | Conta |
|---|---|
| `inter-conta/` | Inter conta PF (Bárbara) |
| `inter-cartao/` | Fatura do cartão Inter (Bárbara + adicional Lucas) |
| `bb/` | Banco do Brasil (Lucas) |
| `itau/` | Itaú (Lucas, salário) |
| `nubank/` | Cartão Nubank |
| `flash/` | Flash Benefícios |
| `planilha/` | Versões mensais da planilha "Controle Financeiro" (.xlsx) ou outro CSV antigo |

## O que testar na Fase 1

Comece pelo modo demo (**Ajustes > Dados > Modo demo**, ou `python app.py --demo`):

- **Início**: saldo do mês, quanto ainda podem gastar (e por dia), 3 alertas, fila de dúvidas, metas.
- **Dúvidas**: classifique "Pix recebido - Cliente Loja Rocco" como *Renda extra* com "Do negócio" ligado.
  Os parecidos somem juntos e a regra aparece em Ajustes > Regras aprendidas.
- **Lançamentos**: filtros; abas *Recorrentes* (Netflix, Spotify, Canva…) e *Parcelados*.
- **Alertas**: a compra parcelada da Magazine Luiza (1/10) aparece com a renda futura comprometida.
- **Dívidas**: ordem sugerida; simulador "pagar MetaEds no cartão" (preencha "quanto conseguem pagar"
  menor que a fatura para ver o alerta de rotativo); antecipação do consignado.
- **Importar**: envie um CSV qualquer como "Planilha antiga" e mapeie as colunas.
- Tema claro/escuro (botão no topo) e o celular (`python app.py --rede`).

Depois, desligue o modo demo e importem os extratos de verdade.

## Primeira carga (já feita em 23/10/2026)

`carga_inicial.py` copia os arquivos para `entrada/<conta>/`, importa tudo e aplica `dados/ajustes.json`
(dívidas e valores estimados combinados com vocês; fica fora do git). Pode rodar de novo: nada duplica.

## Onde ficam os dados

- `dados/financas.db`: banco real (SQLite). `dados/demo.db`: demonstração.
- `entrada/`: extratos baixados.
- Nada disso vai para o git (`.gitignore`). Backup: **Ajustes > Backup** ou `python backup.py`.

## Estrutura

```
app.py          servidor local (biblioteca padrão do Python) + API JSON
importar.py     importação pela linha de comando
carga_inicial.py  primeira carga dos dados reais (arquivos + ajustes locais)
backup.py       cópia do banco para uma pasta (ex.: Google Drive)
nucleo/
  db.py             esquema SQLite e cadastro inicial (contas, categorias, regras, dívidas)
  importadores/     leitores de OFX, CSV, Excel (.xlsx) e PDF do Itaú
  planilha.py       planilha antiga: cartões, categorias de vocês, orçado por categoria
  importacao.py     pipeline: ler, deduplicar, categorizar, transferências, dívidas, alertas
  categorizar.py    regras, heurísticas, fila de dúvidas e aprendizado
  transferencias.py pares de transferência entre as contas do casal
  dividas.py        saldo, término, prioridade, simuladores (cartão e antecipação)
  alertas.py        motor de alertas configurável
  analises.py       totais, recorrentes/assinaturas, parcelamentos
  resumo.py         números da tela inicial
  demo.py           extratos fictícios para o modo demo
web/            interface (HTML, CSS e JS puros, sem dependências externas: funciona offline)
testes/         testes automáticos
DECISOES.md     decisões tomadas sem perguntar (para revisarem)
```

> Orientação educativa, não é consultoria financeira.
