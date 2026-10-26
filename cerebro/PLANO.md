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
- Taxas conferidas no extrato da Cartpanda (26/10): cartão = 5,99% + acréscimo da parcela (o Único Drop está certo nisso), Pix 0,99%, R$ 0,35 de processamento por pedido (o Único Drop não conta). 1x = 5,99% também conferido (Transações da Cartpanda). Falta provar 7x a 12x.
- Reserva da Cartpanda (5% por 90 dias) e cartão a liberar (D+2) entram no card "Dinheiro preso na Cartpanda"; batem com o Extrato de 26/10 (cartão a liberar R$ 929,01 + R$ 1,75 de processamento = R$ 930,76).
- Conversão do Pix de outubro: Cérebro 86,15% = Cartpanda 86,15% (o Único Drop mostra 86,36%, contando um pedido a mais em 14/10).
- Gateway de outubro: Cérebro R$ 1.715 × Único Drop R$ 1.145. Hipótese: o reprocessamento do Único Drop (pedidos até 18/10) usou cartão 5,99% fixo, sem o acréscimo. A "Visão geral" da Cartpanda (valor líquido R$ 23.378,82, 98 vendas) ainda não fecha com nenhum dos dois: pedir a exportação de Financeiro > Transações de outubro para conferir pedido a pedido.
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
