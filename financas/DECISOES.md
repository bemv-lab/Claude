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
- **Consignado (pai)**: reconhece no extrato uma saída de exatamente R$ 680,00 até 4 dias antes ou depois
  do dia 15. Se souberem o nome que aparece no Pix (ex.: nome do seu pai), coloquem em "trecho da
  descrição": fica mais preciso. Faltam: parcelas restantes, mês final e taxa do contrato (para o
  simulador de antecipação).
- **Saldo informado vale a partir do dia em que foi informado**: pagamentos anteriores não descontam de
  novo.
- **MetaEds**: valor em branco (não bloqueia nada). Forma de pagamento "cartão 1x" mostra o simulador.
  Juros do rotativo padrão: 14,5% a.m. (média aproximada de grandes bancos; ajustem pelo app do cartão).
  O simulador considera IOF e o teto legal de 100% de encargos (Lei 14.690/2023).
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
