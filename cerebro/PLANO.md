# Cérebro Rocco · plano (26/10/2026)

Sistema único da Rocco Kids: financeiro, precificação, campanhas, produto, criativos, pedidos e contabilidade, com uma memória compartilhada que qualquer conversa com o Claude consulta. Sistema em `cerebro/` (como rodar: `README.md`). Maquete inicial: `cerebro/prototipo.html`.

## Princípio central: memória antes de telas

O problema de hoje são os chats soltos, que perdem contexto e gastam tokens. O núcleo do Cérebro é um banco de dados com os números e as decisões da Rocco, exposto ao Claude por um **servidor MCP próprio** (`rocco-cerebro`). Assim:

- qualquer conversa (Claude Code, claude.ai, celular) pergunta ao Cérebro em vez de você reexplicar;
- o agente usa a sua assinatura do Claude e não cobra API por token em cada pergunta;
- cada decisão vira um registro datado (Memória), com a origem dela.

## Arquitetura

| Camada | Escolha | Por quê |
|---|---|---|
| App | Next.js (TypeScript) | uma base para telas e API; o repo já usa TS (Remotion) |
| Banco | SQLite embutido no Node 22 | transação e histórico num arquivo só; backup é copiar o arquivo; troca por Postgres fica só em `lib/db.ts` |
| Coletores | jobs agendados (Node) | Meta Ads, Cartpanda, Shopify, ML, Shopee, fatura da Meta |
| Agente | servidor MCP + Claude | lê e grava no banco; ações externas só com OK |
| Hospedagem | Oracle Cloud Always Free (ARM) + Docker | custo R$ 0; cabe app + banco + coletores |
| Acesso | Cloudflare Tunnel + Access | login por e-mail para Bárbara e Lucas, sem abrir portas; grátis até 50 usuários |
| Backup | `npm run backup` diário (cópia consistente) + rclone para o Google Drive | dado financeiro não pode depender de uma VM grátis |

Alternativa com menos manutenção: Supabase (Postgres + login) + Vercel, ~US$ 25/mês quando sair do plano grátis.

## Módulos e fases (ordem por impacto no caixa)

0. **Fundação**: banco, login, identidade visual, importação do Único Drop, servidor MCP e Memória.
1. **Dinheiro**: custo do produto e precificação (DAS, plataforma, mix real de parcelamento, frete, embalagem, imposto Meta); faturamento, ticket médio, carrinhos; DRE e lançamentos; taxas e planos com gatilhos (ex.: N pedidos/mês → reavaliar plano da Cartpanda Pay).
2. **Campanhas**: coleta diária da Meta; esteira teste → validação → escala com regras tiradas da precificação (CPA máximo e ROAS de break-even); o agente sugere, e você aprova a ação na Meta.
3. **Produto e criativos**: mineração, biblioteca de criativos com resultado, copies a partir dos vencedores, do Manual de Linguagem e das regras (CDC 37, CONANDA 163); liga a fábrica de vídeo (`rocco-video/`).
4. **Operação**: pedidos do Mercado Livre e da Shopee processados pelo agente, deixando para vocês só o Pix ao fornecedor; documentos da empresa.
5. **Atendimento no direct**: substituto do ManyChat pela API de mensagens do Instagram (exige app aprovado pela Meta).

## Fato que muda o cálculo: imposto da Meta (2026)

Desde 01/01/2026 a Meta repassa PIS/Cofins (9,25%) e ISS (2,9%): no pós-pago, R$ 100 de mídia viram R$ 113,83. No pré-pago (Pix/boleto), o depósito é o mesmo e sobra menos mídia (R$ 1.000 → ~R$ 878,50). O Gerenciador mostra o gasto **sem** imposto. Ainda não há confirmação de que o Único Drop considera isso. No Simples Nacional não há crédito. A linha de ~1% (CBS 0,9% + IBS 0,1%) é exibição de teste da reforma e, segundo a Meta, não é cobrada em 2026. Confirmar com a fatura real.

## Pendências da Bárbara

- Telas ou exportações do Único Drop (todas as abas e campos).
- Brand Bible completa (no repo só há cores e a fonte, em `rocco-video/src/marca.ts`) e a imagem de referência visual.
- Taxas reais da Cartpanda / Cartpanda Pay por forma e parcela, plano atual e os próximos planos.
- Regime tributário e anexo do Simples (CNPJ), contador.
- Uma fatura da Meta com a linha do "1%".
- Se vão usar a Oracle: criar a conta (pede cartão só para verificação).

## Estado (26/10/2026)

Feito na v0.1: login, Início, Precificação, Financeiro e DRE, Taxas e planos com gatilhos, Campanhas (importação do CSV da Meta + esteira), Memória, conector MCP com 7 ferramentas, Docker + túnel da Cloudflare, backup. Testado: contas (`npm run testar`), navegador de ponta a ponta e o conector MCP. Não testado: o build da imagem Docker (sem Docker nesta sessão).

Próximos passos da fase 0/1: importar o Único Drop, conector MCP remoto (claude.ai e celular), coleta automática da Meta pela API e da Cartpanda, lançamentos automáticos de vendas.

## Estado (26/10/2026, noite): módulo financeiro v0.2

Feito: pedidos da Shopify (com forma, parcelas, bandeira, cupom, UF e UTM, sem dados pessoais), anúncios da Meta por dia e por anúncio (várias contas), taxas da Cartpanda Pay por parcela, motor de cálculo com testes, telas Financeiro, Detalhado, Ranking, Conversão, DRE e Despesas, conector MCP com a ferramenta `financeiro`.
Conferido com o Único Drop (prints de 26/10): receita de outubro por forma, checkout 2,5%, conversão do Pix dia a dia e lucro de 26/10 (com as configurações dele).

Pendências do módulo:
- Taxas da Cartpanda Pay (central de ajuda de 30/09 + extrato de 26/10): cartão D+2 5,99%, Pix 0,99%, boleto R$ 3,50, mais os juros da parcela só quando a loja assume (hoje até 6x). **Não existe taxa fixa por pedido**: as taxas dos 13 pedidos do pagamento de 26/10 somam exatamente R$ 215,37 e o saldo pendente de R$ 930,76 bate centavo por centavo. (Uma versão anterior deste plano falava em R$ 0,35 por pedido: era engano e foi removida.) Os R$ 4,90 de "taxa de processamento" são cobrados por repasse; falta confirmar se em todo repasse.
- Reserva da Cartpanda (5% por 90 dias) e cartão a liberar (D+2) entram no card "Caixa"; batem com o Extrato de 26/10 (cartão a liberar R$ 930,76).
- Conversão do Pix de outubro: Cérebro 86,15% = Cartpanda 86,15% (o Único Drop mostra 86,36%, contando um pedido a mais em 14/10).
- Gateway de outubro: Cérebro R$ 1.614,88 × Único Drop R$ 1.145,01. Causa provável, vista na tela dele: o reprocessamento de 20/10 (pedidos de 01/06 a 18/10) usou cartão 5,99% fixo, sem os juros das parcelas; só nos pedidos até 18/10 são ~R$ 510 de juros que ele não conta. A "Visão geral" da Cartpanda (valor líquido R$ 23.378,82, 98 vendas) ainda não fecha com nenhum dos dois: pedir a exportação de Financeiro > Transações de outubro para conferir pedido a pedido.
- Custo de cada produto (só o Livro Sensorial Fazenda, R$ 90,99, foi deduzido do Único Drop).
- Chaves da Shopify e da Meta no servidor (conta de anúncios: C01 - Lucas Oliveira (RK)).
- Próximo módulo sugerido: Clientes VIP e Matriz RFM (os prints já chegaram; o Cérebro já guarda o id do cliente da Shopify).

## Estado (26/10/2026, fim da noite): conta PJ e planos da Cartpanda

- Aba Conta PJ: importa o OFX do banco (sem duplicar), classifica por regras editáveis e leva ao DRE o que é despesa (DAS na competência do mês anterior, contador, assinaturas, pró-labore, tarifas). Repasse da Cartpanda, fornecedor, checkout (Stripe), retiradas, aplicações e anúncios ficam fora do resultado, só para conferência.
- Conferido no extrato do Inter (28/09 a 26/10, saldo R$ 8.100,10): checkout cobrado pela Stripe = 2,5% das vendas de cada semana; fornecedor "Pix Marketplace" com R$ 90,99 por Livro Fazenda; DAS R$ 829,47 = 4% de R$ 20.736,75 (provavelmente setembro).
- Plano da Cartpanda: comparação automática (Light × Starter × Premium × Advanced) com as vendas dos últimos 30 dias; o Início avisa quando trocar compensa. Starter vale a partir de R$ 24.402/mês.
- Cartpanda Pay: aceita até 12x, juros assumidos pela loja até 6x (7x+ a loja paga 5,99%).

Em aberto (Bárbara):
- O que é a Maree Instituição de Pagamento (42 Pix, 17 devolvidos; valores de R$ 59,99 e R$ 69,99) e o boleto Mercado Pago de R$ 65,09.
- Retiradas da Bárbara (R$ 1.620,56): pró-labore (despesa) ou distribuição de lucro (fora do resultado)?
- Fornecedor pago (R$ 5.192,62) × custo calculado (R$ 8.553,06) em outubro: parte paga por outra conta ou pela Maree?
- Por onde são pagos os anúncios da Meta (não saem da conta PJ)? Se for cartão de sócio, lançar como despesa paga por fora e combinar o reembolso.

## Estado (26/10/2026, noite): correções da Bárbara, cartões e radar de custos

Correções que ela trouxe e já estão no sistema:
- O DAS de R$ 829,47 são guias do MEI em atraso desde fevereiro, e os R$ 1.499,00 ao RRT são o enquadramento de MEI para ME: ambos são despesa **pontual** (linha própria no DRE, fora do "lucro recorrente"). A estimativa de 4% de DAS continua valendo para o mês como ME, mas pelo faturamento anualizado a alíquota efetiva do Simples (Anexo I) fica perto de 5,4%: confirmar com o RRT. Atenção: o limite do MEI é R$ 81 mil por ano; perguntar ao RRT o efeito retroativo de ter passado dele.
- Os R$ 1.620,56 enviados à Bárbara são reembolso de despesas pagas no cartão pessoal (Meta, Shopify): fora do resultado; o sistema mantém o saldo "a empresa deve à Bárbara".
- "Maree" é ShopeePay e "Pix Marketplace" é Mercado Livre: ambos são compras de fornecedor. Os R$ 800 em CDB são a garantia do limite do cartão PJ.

Novo:
- Cartão PJ do Inter: importação de CSV ou OFX, fatura aberta (fecha dia 3, vence dia 10), limite disponível; cartão pessoal e Meta como contas à parte; compras de fornecedor se vinculam a pedido ou produto, com sugestão automática pelo valor do custo; detector de possível pagamento em duplicidade (R$ 65,09 em 14/10 no cartão e por boleto).
- Aba Custos: taxa de pagamento por semana, juros que a loja assume (R$ 910 em 30 dias) com simulação de "sem juros até Nx" e pedidos a mais para se pagar, prazo de recebimento D+2/D+5/D+14, Pix contra cartão, DAS pelo Anexo I e custos fixos. O Início e o conector MCP mostram os avisos.
- Custos dos produtos copiados da tela Produtos do Único Drop (9 de 15), com custo em dólar e cotação configurável.

Em aberto com a Bárbara: boleto do Mercado Pago de R$ 65,09; o que são Ebanx, Ebury e Vindi (R$ 719,22); cotação do dólar do Único Drop; custo dos 6 produtos em branco; fatura do Shopify; exportação de Financeiro > Transações da Cartpanda; detalhe de outro repasse (os R$ 4,90 se repetem?).

## Estado (27/10/2026): custo médio, caixa, plano de ação e novo visual

Decisões da Bárbara que viraram regra do sistema:
- Custo do produto = **média geral dos pagamentos a fornecedor** (valor pago ÷ unidades), com vínculo a produto (+ quantidade) ou a pedido. Os custos do Único Drop foram zerados. Ebanx = FFOrder e Ebury = Wiio (fornecedores da China, contam como compra de produto); Vindi ainda não identificada (despesa "a identificar" até ela dizer).
- R$ 4,90 é cobrado em **cada saque** (o radar conta os saques reais do extrato).
- Imposto da Meta aparece no financeiro, no painel, no DRE e na precificação (CPA, ROAS e ROI reais, ao lado do número do Gerenciador).
- DAS: Anexo I não se aplica (ME com CNAE de revenda); 4% fica provisório até ela avisar o imposto da revenda e a diferença de ICMS.
- Otimizações que dependem de caixa (D+5, D+14, saque em lote, Shopify anual de US$ 204) ficam no radar da aba Caixa e só liberam quando a folga passa de 1,5× o dinheiro que deixam parado.
- Mudança de política de parcelamento só depois de documentada como experimento no Plano de ação.

Feito: aba Caixa (previsão de 10 dias, recomendação "usar saldo ou sacar", Meta a cobrar), aba Plano de ação (antes e depois, queda de conversão, ações sugeridas), parcelamento médio e tolerância do cenário 3x, Pix contra cartão em teoria e prática, histórico de política de taxas por data, conector MCP com `caixa` e `custo_produtos`, visual novo (barra lateral escura, DM Sans em tudo, números tabulares, mais contraste).

Em aberto: cotação ou valor em reais da cobrança do Shopify anual; o que é a Vindi; lista completa do que foi pago no cartão pessoal (para o valor que a empresa deve à Bárbara); R$ 65,09 em duplicidade; imagem de referência visual (não chegou a esta sessão); exportação de Financeiro > Transações da Cartpanda para conferir o mês pedido a pedido; limite do cartão PJ depois que ela aumentar.

