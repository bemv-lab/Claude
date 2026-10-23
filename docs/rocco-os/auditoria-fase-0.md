# Rocco OS · auditoria técnica da Fase 0

**Autorização:** auditoria técnica da Fase 0, **sem implementar integrações e sem alterar sistemas externos** (proprietária, 23/10/2026).
**Regra desta fase:** leitura apenas. Cada leitura em conta sua (Shopify, Cartpanda, Único Drop) só acontece com o seu OK para aquela leitura. Nenhuma mensagem é enviada a suporte em seu nome.
**Arquitetura de referência:** `docs/rocco-os/arquitetura.md` (revisão 3).

---

## 1. Andamento

| Etapa | Escopo | Responsável | Situação |
|---|---|---|---|
| 0A | Pesquisa pública (documentação e sites oficiais) | Claude | **Concluída em 23/10/2026** (seção 2) |
| 0B | Único Drop: plano, cadastro de custo, exportação, histórico, API | Proprietária + suporte da Único Drop | Aguardando informações (seção 4) |
| 0C | Cartpanda / Cartpanda Pay: taxas contratadas, parcelamento, exportações, token | Proprietária + suporte da Cartpanda | Aguardando informações (seção 5) |
| 0D | Shopify: leituras sem dados pessoais pelo conector | Claude, **com OK específico** | Aguardando OK (seção 6) |
| 0E | Teste do lucro da Único Drop: 10 pedidos × cálculo manual | Proprietária + Claude | Depois de 0B e 0C |
| 0F | Ambiente e termos (Docker, MFA, termos Supabase e Cloudflare) | Claude | A fazer (não depende das suas contas) |

---

## 2. Resultado da etapa 0A (pesquisa pública, 23/10/2026)

Limite: a rede deste ambiente bloqueia o acesso direto a help.cartpanda.com, dev.cartpanda.com e unicodrop.com.br. Tudo abaixo veio de **trechos de busca em domínio oficial**. Para a Único Drop, são **páginas de marketing**.

### 2.1 Único Drop

| Pergunta | Resposta encontrada | Status |
|---|---|---|
| Tem API? | "Acesso à API (documentação e tokens)" listado no **plano Elite** | Existência citada; **documentação não pública**; seu plano: desconhecido |
| A API dá custos e pedidos? | Não há como saber sem a documentação | **Lacuna L22** |
| Exporta arquivo? | Nada documentado | **Lacuna L23** |
| Guarda custo por pedido / histórico? | Não documentado | **H9, L21** |
| Integra com Shopify e Cartpanda? | Sim, por chaves coladas no painel; importa pedidos | Confirmado (marketing) |
| Mostra lucro por pedido? | Sim: custo do produto e frete, taxas, margem por pedido e campanha; lê gastos da Meta | Confirmado (marketing); exatidão a testar em 0E |
| Planos | Nomes e preços divergem entre páginas (Growth R$ 139/139,90; Elite R$ 289; Ultra R$ 399,90) | Confirmar com o seu plano |

**Conclusão parcial:** API acessível **não** confirmada. O caminho mais provável sem custo é a exportação de arquivo, que ainda precisa ser comprovada (0B).

### 2.2 Cartpanda / Cartpanda Pay

| Pergunta | Resposta encontrada | Status |
|---|---|---|
| Tem API? | Sim, pública ("CartX"), *bearer token* da loja; pedidos em `accounts.cartpanda.com/api/{loja}/orders` (v1) e `/api/v3` | Confirmado (doc via busca) |
| O pedido da API traz a taxa? | Traz `payment_gateway`, `payment_type`, `payment_status`, `no_of_installments`, `installments_rate`, totais. **Nenhum campo de taxa, líquido ou liberação documentado** | **Lacuna L25** |
| O token é só leitura? | Não documentado. A API também tem rotas de alteração | **Lacuna L26** |
| O painel mostra taxa por pedido? | Sim: "taxas por pedido", "recebível do gateway" (bruto − taxas), líquido do período, reserva, chargebacks, reembolsos | Confirmado (central de ajuda via busca) |
| Exporta pedidos? | Sim: CSV em Pedidos > Todos os pedidos (filtro por gateway) e "Exportação Avançada" (Excel/CSV, colunas escolhidas) | Confirmado; **colunas de taxa: lacuna L27** |
| Exporta taxas da Cartpanda por pedido? | Sim: CSV de cobranças com número do pedido e valor | Confirmado; colunas exatas: a ver na amostra |
| Exporta o extrato do Cartpanda Pay? | Não encontrado | **Lacuna L28** |
| Taxas | Padrão publicado: cartão D+14 4,99% / D+5 5,49% / D+2 5,99%; Pix 0,99%; boleto R$ 3,50; checkout de 2,5% a 0,5% por pedido pago conforme o plano; juros de parcelamento pagos pelo comprador | **Só referência.** Valem as suas taxas contratadas |
| Pedidos vão para a Shopify? | Sim: pedidos do checkout Cartpanda são enviados à Shopify; o inverso não | Confirmado (central de ajuda via busca) |

**Conclusão parcial:** a taxa por pedido existe no painel. Falta descobrir se ela sai na Exportação Avançada (L27). Se não sair, o cálculo pelas suas taxas contratadas, conciliado todo mês com o líquido do painel, resolve sem trabalho manual por pedido.

### 2.3 Shopify (complemento)
- `OrderTransaction.fees` só existe para o Shopify Payments. Com o checkout Cartpanda, a Shopify **não** terá a taxa.
- Os campos `sourceName`, `sourceIdentifier`, `customAttributes`, `tags`, `paymentGatewayNames` e `Shop.ianaTimezone` existem no esquema. Isso confirma a existência do campo de fuso da H6; o valor ainda falta ler.

---

## 3. O que já está decidido para a Fase 0

- Nenhuma integração será criada, nenhum token será gerado por mim e nenhuma configuração será alterada em Shopify, Cartpanda ou Único Drop.
- Arquivos de amostra devem chegar **sem colunas de cliente** (nome, e-mail, telefone, endereço, CPF). Se chegar algum com essas colunas, eu não abro o conteúdo e peço uma versão limpa.
- Taxas padrão publicadas nunca são usadas como definitivas.

---

## 4. Etapa 0B · Único Drop: o que preciso de você

1. **Nome do seu plano atual.**
2. **Capturas de tela** (sem dados de clientes):
   - tela de cadastro ou edição do custo de um produto, mostrando todos os campos;
   - tela de um pedido mostrando custo, taxas e lucro;
   - menu de relatórios e qualquer botão "Exportar".
3. **Se houver exportação**, dois arquivos de **um mês fechado**, com as colunas de cliente apagadas:
   - pedidos (com custo e lucro, se houver);
   - produtos ou custos.
4. **Suas respostas:**
   - O custo é cadastrado por produto ou por variante (cor, tamanho)?
   - O frete de aquisição é um campo separado? Ele é o frete pago ao fornecedor para enviar ao cliente, ou outro frete? (R10)
   - Quando você muda o custo de um produto, os pedidos antigos passam a mostrar o custo novo? (H9; responda pelo que você já viu, **não altere nada para testar**)
   - Há estoque próprio, ou é tudo enviado pelo fornecedor? (R13)
5. **Pergunta ao suporte da Único Drop** (texto pronto; você envia se quiser):

> Olá! Uso a Único Drop integrada à Shopify e à Cartpanda. Preciso saber:
> 1. Meu plano tem acesso à API? Se não, qual plano tem e qual o valor?
> 2. Existe documentação da API? A API permite **somente leitura** de: (a) custos dos produtos/variantes, (b) pedidos com o custo de produto e de frete usado em cada pedido? Os tokens podem ser criados com permissão só de leitura?
> 3. Consigo **exportar** (CSV ou Excel) os pedidos com o custo de produto, o frete e as taxas de cada pedido? E a lista de produtos com custo?
> 4. Quando altero o custo de um produto, os pedidos antigos mantêm o custo da época ou passam a usar o custo novo? Existe histórico de alterações de custo?
> 5. As taxas de pagamento que aparecem no lucro de cada pedido vêm da Cartpanda (valor real) ou de um percentual que eu configuro?
> 6. Os produtos ficam ligados à Shopify pelo ID da variante ou pelo SKU?
>
> Obrigada!

---

## 5. Etapa 0C · Cartpanda / Cartpanda Pay: o que preciso de você

1. **Captura de Admin > Pagamentos > Cartpanda Pay > Gerenciar** com as suas taxas por método e prazo, o prazo de recebimento escolhido e a antecipação.
2. **Configuração de parcelamento:**
   - máximo de parcelas;
   - se há parcelas sem juros, quantas;
   - quem paga os juros (R11).
3. **Nome do seu plano Cartpanda** (define a taxa de checkout).
4. **Arquivos de um mês fechado**, sem colunas de cliente:
   - **Exportação Avançada de pedidos** com: número do pedido, data de pagamento, status de pagamento, método, parcelas, valor bruto, e **qualquer coluna de taxa, tarifa, recebível ou valor líquido que aparecer na lista**, além de reembolso e chargeback. Uma captura da lista de colunas disponíveis também ajuda (L27).
   - **CSV de cobranças** (taxas cobradas pela Cartpanda por pedido).
   - **Extrato do Cartpanda Pay**, se houver botão de exportação (L28).
5. **Totais do mesmo mês** em Financeiro > Visão Geral: bruto, líquido, reembolsos, chargebacks, reserva.
6. **Onde você faz reembolsos:** no Cartpanda Pay, na Shopify ou nos dois? (H8)
7. **Você usa antecipação?** Com qual custo? (R12)
8. **Pergunta ao suporte da Cartpanda** (texto pronto; você envia se quiser):

> Olá! Uso o checkout Cartpanda integrado à Shopify, com o Cartpanda Pay. Preciso saber:
> 1. A API (v1 ou v3) retorna, por pedido, a **taxa do Cartpanda Pay**, o **valor líquido** e a **data de liberação**? Em qual endpoint e campo?
> 2. O que significa o campo `installments_rate` do pedido?
> 3. Os tokens de API podem ser criados com permissão **somente de leitura**?
> 4. A "Exportação Avançada" de pedidos permite incluir colunas de taxa do gateway e valor líquido (recebível)?
> 5. É possível exportar o **extrato** do Cartpanda Pay (CSV/Excel) com taxa e líquido por pedido?
> 6. Reembolsos e chargebacks feitos no Cartpanda Pay são refletidos no pedido da Shopify?
> 7. No pedido que vai para a Shopify, onde fica o número do pedido Cartpanda?
>
> Obrigada!

---

## 6. Etapa 0D · Shopify: leituras propostas (aguardam o seu OK)

Feitas pelo conector Shopify desta conta, **somente consulta**. Nenhum campo de cliente (nome, e-mail, telefone, endereço, cliente) é pedido. Em `customAttributes`, peço **só o nome da chave**, sem o valor, porque o valor pode conter dados pessoais.

| # | Para quê | Consulta (resumo) |
|---|---|---|
| Q1 | H6: fuso e moeda da loja | `shop { ianaTimezone currencyCode }` |
| Q2 | H12, H13: como o pedido Cartpanda aparece na Shopify | 20 pedidos recentes não-teste: `id name processedAt updatedAt sourceName sourceIdentifier tags paymentGatewayNames customAttributes { key } displayFinancialStatus cancelledAt currentTotalPriceSet totalRefundedSet` |
| Q3 | H4, H8: reembolsos refletidos e `updatedAt` | 10 pedidos com `financial_status:refunded` ou `partially_refunded`: `id name updatedAt refunds { processedAt createdAt totalRefundedSet }` |
| Q4 | H11 e cobertura de custo: a Shopify tem o custo? | Variantes: `id sku inventoryItem { unitCost { amount currencyCode } }`, paginado, para contar quantas têm custo e comparar 5 com a Único Drop |
| Q5 | H3: campo de receita líquida do item | 1 pedido: `lineItems(first: 5) { nodes { currentQuantity priceAfterAllDiscountsBeforeTaxesSet { shopMoney { amount } } } }`. Se o conector recusar o campo, isso só mostra que a versão fixada do conector não o tem; o teste definitivo é na versão 2026-10 (Fase 2) |
| Q6 | Volume (R6) | Contagem de pedidos não-teste dos últimos 90 dias |

**Fora do conector (você confere):**
- **H1:** no Dev Dashboard (dev.shopify.com), em "Lojas", a loja da Rocco aparece na sua organização? Só olhar, **não criar app**.
- **L20:** a fatura da Shopify tem linha de "taxas de transação"?

---

## 7. Etapa 0E · teste do lucro da Único Drop

Depois de 0B e 0C:
- você escolhe 10 pedidos pagos de um mês fechado (cartão à vista, parcelado, Pix e, se houver, um com reembolso);
- para cada um, comparo o lucro da Único Drop com o cálculo componente a componente: receita, custo, frete de aquisição, taxa Cartpanda Pay pelas suas taxas, taxa de checkout;
- cada diferença é explicada.

**Saída:** recomendação para a decisão D16 (o que o Rocco OS deve fazer em relação à Único Drop).

---

## 8. Etapa 0F · ambiente e termos (a fazer)

- **L9:** Docker no ambiente (`docker info`).
- **L10:** claim `aal` no JWT do Supabase (doc de MFA).
- **L11:** limite do SMTP embutido.
- **L13:** se a atividade do pg_cron evita a pausa do Free.
- **L18:** termos da Cloudflare para uso comercial no Free.
- **L19:** termos completos do Supabase.

---

## 9. Registro de evidências

| Data | Item | Evidência | Resultado |
|---|---|---|---|
| 23/10/2026 | 0A Único Drop | Buscas em unicodrop.com.br (páginas de integração, dashboard, planos) | API só citada no Elite; sem doc; exportação não documentada |
| 23/10/2026 | 0A Cartpanda | Buscas em help.cartpanda.com e dev.cartpanda.com | Painel tem taxa por pedido; API sem campo de taxa documentado; CSVs de pedidos e cobranças existem |
| 23/10/2026 | 0A Shopify | Esquema via conector | `fees` só Shopify Payments; campos de ligação e de fuso existem |
