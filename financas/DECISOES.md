# Decisões tomadas (revisar quando puderem)

Decisões que não bloqueavam o trabalho. Tudo aqui é editável na interface ou no código.

## Stack
- **Só a biblioteca padrão do Python** (servidor `http.server`, `sqlite3`, `csv`), em vez de FastAPI.
  Motivo: zero instalação no computador de vocês (nada de `pip`, ambiente virtual ou versão quebrando),
  custo zero e menos coisa para dar defeito. A API é a mesma ideia de uma FastAPI.
- **Frontend sem bibliotecas** (HTML/CSS/JS puros). Os gráficos são barras e medidores desenhados no
  próprio CSS: funcionam offline por construção, sem servir nenhuma biblioteca.
- Fonte: a do sistema (San Francisco no iPhone/Mac, Segoe no Windows, Roboto no Android), para não
  depender de baixar fonte da internet.

## Privacidade e acesso
- O servidor escuta só em `localhost`. Para o celular, `python app.py --rede`, que gera um **PIN** a cada
  início (ou `--pin 123456` para fixar). Sem o PIN, a rede não vê nada.
- Pedidos vindos de outro site são recusados (checagem de `Origin`), para nenhuma página da internet
  conseguir mexer nos dados pelo navegador.

## Importação
- **Deduplicação** por conta + data + valor + nº da parcela + ordem de ocorrência no arquivo. Ignora a
  descrição de propósito: assim o mesmo período baixado em OFX e depois em CSV não duplica, e duas compras
  iguais no mesmo dia continuam sendo duas.
- Arquivos já importados (mesmo conteúdo) são reconhecidos e pulados. Os arquivos **ficam** em `entrada/`
  (nada é movido ou apagado).
- **Cartão**: nos CSVs de fatura as compras vêm positivas; o sistema detecta pela maioria e inverte, para
  que saída seja sempre negativa.
- **Portador do cartão Inter**: usa uma coluna "Portador"/"Cartão"/"Titular" se o extrato trouxer. Se não
  trouxer, a compra fica como **Casal** (editável). Se o extrato mostrar o final do cartão de cada um,
  cadastrem em Ajustes > Quem usa cada cartão (ex.: "4321" → Lucas).
- Compras no cartão contam no mês **da compra** (não no mês em que a fatura é paga). O pagamento da fatura
  não conta como gasto, para não contar duas vezes.
- **PDF** fica para a Fase 3, como combinado. Hoje o arquivo PDF é recebido e avisado.
- **Planilha antiga**: qualquer CSV na pasta `planilha/` (ou enviado como "Planilha antiga") pede o
  mapeamento de colunas na 1ª vez; o mapeamento é salvo pelo cabeçalho e reaproveitado.

## Categorização
- Ordem: regras aprendidas com vocês > regras de fábrica (~260 palavras-chave) > categoria que o próprio
  banco manda no CSV > heurísticas > fila de dúvidas.
- A regra aprendida guarda se é **entrada ou saída**: um Pix *para* a Maria pode ser presente e um Pix
  *da* Maria pode ser reembolso.
- Lançamento sem categoria e com valor negativo conta como gasto no orçamento (postura conservadora).
  Entradas sem categoria **não** contam como renda até serem classificadas (aparece o aviso na Início).
- "Negócio (Rocco Kids)" é uma marcação separada da categoria: dá para ter *Assinaturas* do negócio.
  Anúncios (Facebook/Meta), Shopify, Runway, Metricool, Correios/Melhor Envio já entram como negócio.

## Transferências
- Saída numa conta + entrada de mesmo valor em outra conta de vocês em até 3 dias, com Pix/TED/TRANSF na
  descrição = transferência (não conta como gasto nem renda).
- Pix com o nome de vocês (BARBARA, LUCAS) sem a outra ponta importada vai para a fila com a sugestão
  "Transferência entre vocês". Os nomes ficam em Ajustes.

## Benefício (Flash)
- Crédito do Flash é "saldo de benefício", **fora** da renda livre e do saldo do mês. Os gastos com o Flash
  aparecem nas categorias (comportamento), mas não pesam no orçamento. Titular cadastrado como Casal até
  vocês dizerem de quem é.

## Orçamento ("quanto ainda podem gastar")
- Automático: renda de referência − parcelas de dívidas − meta de poupança. Renda de referência = maior
  valor entre a média dos 3 meses anteriores e a renda já recebida no mês. Podem fixar renda e orçamento
  em Ajustes.

## Dívidas
- **Consignado (pai)** (dados de 23/10/2026): 48 parcelas de R$ 680,00, dia 15, de 15/06/2025 a 15/05/2029;
  17 pagas até 15/10/2026, 31 restantes (R$ 21.080,00). O sistema reconhece no extrato uma saída de exatamente
  R$ 680,00 até 4 dias antes ou depois do dia 15 e abate uma parcela. A contagem é **por mês**: a de outubro
  paga no dia 16 continua sendo a de outubro (já está nas 17); a partir de novembro, cada mês pago abate uma.
  Pagar mais de uma no mesmo mês (antecipação) abate todas e encurta o término.
  Se souberem o nome que aparece no Pix para o seu pai, coloquem em "trecho da descrição": fica mais preciso.
- **Valor originalmente emprestado** (opcional): com ele o sistema calcula a taxa implícita (tabela Price,
  48 parcelas), os juros totais do contrato e quanto custaria quitar ou antecipar hoje. A taxa implícita também
  entra na ordem de prioridade. Se souberem a taxa do contrato, ela vale mais que a implícita. Como o consignado
  está no nome do seu pai, a economia só existe se ele amortizar no banco.
- **Saldo informado vale a partir do dia em que foi informado**: pagamentos anteriores não descontam de
  novo.
- **MetaEds**: R$ 2.000,00, pagamento previsto no cartão em 1x. Alerta em destaque antes de passar o cartão:
  em qual fatura cai (Inter: fechamento dia 3 e vencimento dia 10, **confirmem** em Ajustes > Contas), a fatura
  estimada e se o que sobra no mês cobre a fatura inteira. Se não cobre, mostra o custo do rotativo. Quando a
  compra "METAEDS" aparece na fatura, a dívida é dada como paga no cartão e o alerta passa a ser "paguem a
  fatura inteira até o vencimento". "Sobra do mês" = renda de referência − parcelas de dívida − gastos fora do
  cartão (estimativa). Juros do rotativo padrão: 14,5% a.m. (ajustem pelo app do cartão); o simulador considera
  IOF e o teto legal de 100% de encargos (Lei 14.690/2023).
- **Nubank**: em negociação, urgência "atenção". Para priorizar, dívida de banco/cartão sem taxa informada
  é tratada como 8% a.m. (estimativa conservadora) e isso aparece escrito como "estimado".
- **Ordem sugerida**: urgência (cobrança/negativação) > juros mais caros > saldo menor. Dívidas de família
  sem juros ficam por último, com a observação de manter o combinado.

## Alertas
- Todos ligados por padrão e desligáveis em Ajustes. Alerta dispensado não volta; se a situação mudar
  (ex.: nova compra parcelada), aparece um alerta novo.
- Parcelamento: toda compra parcelada gera alerta. As novas (parcela 1 ou vistas há menos de 2 meses) são
  "importante"; as que já estavam em andamento, "atenção".

## Metas
- Na Fase 1 só cadastro e progresso (para a Início). "Quanto guardar por mês", "cabe no orçamento" e a
  ordem dívidas → reserva → metas entram na Fase 2.

## Carga dos dados reais (23/10/2026)

Fontes: OFX da conta Inter (jul–out), Excel do BB (jul–out), CSV do Flash (90 dias), PDF do Itaú (jan–jun e
25/07–23/10) e as 5 versões mensais da planilha "Controle Financeiro" (jul–nov). Os valores pessoais combinados
(dívidas, estimativas) ficam em `dados/ajustes.json`, fora do git; o `carga_inicial.py` aplica esse arquivo.

- **Categorias de vocês**: adotei a lista da planilha (aba Val.Dados) no lugar das minhas equivalentes
  (Supermercado, Restaurante, Aluguel, Energia, Internet Móvel, Extras, Taxas, Toddy...). Mantive Dívidas,
  Investimentos, Transferência, Pagamento de fatura, Assinaturas e Negócios, que a planilha não separa.
- **Orçado por categoria**: veio da aba Orçamento (versão de novembro). O total (R$ 7.177,63) virou o
  "orçamento definido por vocês" da tela Início. Os alertas comparam com o orçado; sem orçado, com a média.
- **Cartões sem extrato** (Inter, BB, C6) e dinheiro vivo entram pela planilha. As contas (Inter, BB, Itaú)
  entram pelos extratos; a planilha só ensina as categorias delas.
- **Versões mensais somadas**: compra à vista conta uma vez, mesmo que apareça em duas versões. Parcela
  (2/6, 3/6...) conta uma vez por versão, porque cada versão é a fatura de um mês e a planilha nem sempre
  atualiza o número da parcela. A data da parcela vai para a janela da fatura (fechamento estimado no dia 12;
  vencimento dia 20, confirmado pela planilha). Parcelas incoerentes com o mês da versão (ex.: 8/9 de uma
  compra de 2025 numa versão de 2026) são linhas esquecidas e ficam de fora (16 linhas).
- **Conferência**: o total importado do cartão Inter é exatamente a soma das versões menos as compras à
  vista repetidas. Cada versão bate no centavo com a fatura paga, exceto **setembro**: a versão 9 tem
  R$ 1.935,52 e a fatura paga foi R$ 4.071,08. Faltam ~R$ 2.135 em compras de agosto/setembro que não estão
  em nenhum arquivo.
- **"Parcelamento ..." e "PIX parcelado"** na planilha são pagamento de dívida (o gasto original já foi
  contado quando aconteceu): entram em Dívidas, não em Extras.
- **"Transf. Contas" da planilha não vira regra**: lá ela também guarda ajustes e adiantamento de salário
  (que é renda). Exceção: quando a descrição é o nome de uma categoria ("Aluguel"), vale a categoria.
- **Pix para o próprio titular** (ex.: "PIX TRANSF LUCAS" saindo da conta do Lucas) é transferência entre
  contas dele, mesmo sem a outra ponta (o BB só tem extrato a partir de julho).
- **BB**: "BB Rende Fácil" (aplicação automática diária), "Pagto cartão crédito" e "Estorno de Débito"
  (débito automático da fatura devolvido) não contam como gasto nem renda.
- **"Pix no crédito"** do Inter: a entrada do crédito é neutra; o Pix que sai é o gasto; as parcelas são dívida.
- **Itaú em PDF**: leitor próprio do extrato de conta corrente. Precisa de `pip install pdfplumber`, só para
  PDF. O app cola a data no nome ("BARBARA16/10"); o leitor separa.
- **Estimados** (marcados como "estimado" na lista): salário do Itaú de 15/07 (igual à parcela do dia 15 dos outros
  meses, a pedido do Lucas) e o repasse ao BB no mesmo dia; saldo do Flash antes do período do CSV (R$ 3,70).
- **Salário da Bárbara**: o Pix do empregador dela é Salário (regra manual no `dados/ajustes.json`, como
  está na aba de controle da planilha).
- **Dívidas novas** (da planilha e do detalhe de pagamento do Mercado Pago): Mercado Pago (empréstimos +
  Pix parcelado; saldo = parcelas que faltam) e Empréstimo BB (CDC renovação; saldo a confirmar). O saldo do
  Nubank veio da aba Pagamentos. Valores no `dados/ajustes.json`. Juros de banco sem taxa informada: 8% a.m.
  só para a ordem de prioridade, sempre escrito como "estimado".
- **Alertas de parcelamento**: um por mês com as compras parceladas novas (parcela 1) e um resumo do que está
  em andamento. Parcela vista pela última vez meses atrás é considerada andando (o extrato do mês pode faltar).
  Parcelas da mesma compra com centavos de diferença (arredondamento do banco) contam como uma compra só.

## Fatura do Inter (vencimento 20/10/2026) e correções

- **Fatura de verdade vale sobre a planilha no período dela** (14/09 a 13/10; corte dia 13, confirmado na
  fatura). As compras da planilha nesse período não entram; servem só para dar a categoria à linha igual da
  fatura (mesma data e valor). Fora desse período a planilha continua completando. Conferência: débitos e
  créditos importados batem no centavo com a fatura (R$ 4.808,63 e R$ 659,45).
- A fatura veio em imagens: transcrevi as 166 linhas dos 4 cartões e conferi
  o total de cada cartão com o impresso. O CSV gerado fica em `entrada/inter-cartao/` (fora do git).
- **Crédito do cartão** ("Pix no crédito", "Compra parcelada Inter"): a entrada do crédito abate Dívidas e as
  parcelas ("Parcelamento de compra", "Pix cred à vista/parcelado") somam em Dívidas. O gasto conta uma vez
  (o Pix ou a compra original) e o que sobra em Dívidas são os juros e o IOF.
- **Estorno no cartão** (ex.: Vivara, Shein) leva a categoria da compra da mesma loja.
- **Parcelamentos** agrupados por conta, total de parcelas, valor (até 3%) e sequência (a parcela k+n cai n
  meses depois), e não pelo nome, que muda entre a fatura e a planilha. Em 23/10: R$ 4.377 a pagar no Inter,
  contra R$ 4.484 informados pela fatura no fechamento de 13/10.
- **Facebook (MetaEds)**: R$ 2.000 continuam em aberto e não serão pagos agora. O pagamento de 20/10
  ("Fatura Inter (Facebook)") foi dos anúncios do mês, que entram como gasto do negócio (estimado, até a
  fatura de novembro chegar).
- **Empréstimo BB**: quitado (confirmado pelo Lucas). **Flash**: a compra de 12/10 foi cancelada (estorno).
- As respostas da fila de dúvidas viraram regras no `dados/ajustes.json`; refazer a carga não as perde.
