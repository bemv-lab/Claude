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
| 0D | Shopify: leituras sem dados pessoais pelo conector | Claude, **com OK específico** | Consultas preparadas e revisadas; execução aguarda aprovação (seção 6) |
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

## 4. Etapa 0B · Único Drop: lista completa (só se a rodada mínima da seção 10 não bastar)

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

## 5. Etapa 0C · Cartpanda / Cartpanda Pay: lista completa (só se a rodada mínima da seção 10 não bastar)

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

## 6. Etapa 0D · Shopify: as seis leituras (preparadas, **não executadas**)

**Situação em 23/10/2026:** preparação e revisão autorizadas; execução aguarda aprovação explícita das consultas abaixo.

**Regras:**
- Só a ferramenta de consulta (`graphql_query`) do conector Shopify. Nenhuma mutação, app, token ou alteração.
- Todos os campos foram conferidos no esquema do conector em 23/10/2026.
- **Campos de cliente nunca pedidos:** `customer`, `email`, `phone`, endereços, `note`, `clientIp`, `billingAddress`, `shippingAddress`, `displayAddress`, valores de `customAttributes`, `customerJourneySummary`.
- **`tags` fica fora**, porque é texto livre e pode conter dado pessoal (ver a nota de risco).
- **O que é guardado:** só conclusões agregadas (contagens, se o campo existe, nome do gateway, nomes de chaves). Os valores lidos aparecem só nesta sessão; nada vai para o repositório além disso.

### Q1 · fuso e moeda da loja (H6)
```graphql
query Q1 { shop { ianaTimezone currencyCode } }
```
Retorna: fuso IANA e moeda da loja. Dado pessoal: nenhum.

### Q2 · como o pedido Cartpanda aparece na Shopify (H12, H13)
```graphql
query Q2 {
  orders(first: 20, sortKey: PROCESSED_AT, reverse: true, query: "test:false") {
    nodes {
      id name processedAt updatedAt
      sourceName sourceIdentifier
      paymentGatewayNames
      customAttributes { key }
      displayFinancialStatus cancelledAt
      currentTotalPriceSet { shopMoney { amount currencyCode } }
      totalRefundedSet { shopMoney { amount } }
    }
  }
}
```
Retorna, para 20 pedidos:
- ID interno e número (#1001);
- datas;
- canal de origem e identificador externo;
- nomes dos gateways;
- **só os nomes** das chaves de atributos;
- status financeiro, data de cancelamento, total e valor reembolsado.

Dado pessoal: nenhum pedido. `sourceIdentifier` é, pela doc, um identificador de pedido de terceiro.

### Q3 · reembolsos e `updatedAt` (H4, H8)
```graphql
query Q3 {
  orders(first: 10, sortKey: PROCESSED_AT, reverse: true,
         query: "test:false AND (financial_status:refunded OR financial_status:partially_refunded)") {
    nodes {
      id name processedAt updatedAt
      totalRefundedSet { shopMoney { amount } }
      refunds { id createdAt processedAt totalRefundedSet { shopMoney { amount } } }
    }
  }
}
```
Retorna: número do pedido, datas e, por reembolso, ID, datas e valor. A nota do reembolso (`note`, texto livre) fica fora. Dado pessoal: nenhum.

### Q4 · a Shopify tem o custo? (H11, cobertura)
```graphql
query Q4($after: String) {
  productVariants(first: 250, after: $after) {
    nodes { id sku inventoryItem { unitCost { amount currencyCode } } }
    pageInfo { hasNextPage endCursor }
  }
}
```
Retorna: ID, SKU e custo atual de cada variante, paginado até o fim do catálogo. Dado pessoal: nenhum.

Uso: contar variantes com e sem custo e comparar 5 SKUs com a Único Drop quando houver amostra. Pode exigir a permissão "View product costs" no usuário do conector. Se o campo vier vazio por permissão, isso fica registrado.

### Q5 · campo de receita líquida do item (H3)
```graphql
query Q5 {
  orders(first: 1, sortKey: PROCESSED_AT, reverse: true, query: "test:false") {
    nodes {
      name
      lineItems(first: 5) {
        nodes {
          sku quantity currentQuantity
          originalUnitPriceSet { shopMoney { amount } }
          discountedUnitPriceAfterAllDiscountsSet { shopMoney { amount } }
          priceAfterAllDiscountsBeforeTaxesSet { shopMoney { amount } }
        }
      }
    }
  }
}
```
Retorna: SKU, quantidades e preços dos itens de 1 pedido. O item `customAttributes` (personalização) fica fora. Dado pessoal: nenhum.

**Resultado esperado:** o esquema do conector não lista `priceAfterAllDiscountsBeforeTaxesSet`, então o conector deve **recusar a consulta antes de executar**. Nada é lido. Isso só mostra que a versão fixada do conector não tem o campo; a versão 2026-10 tem, pela doc. Nesse caso, roda-se uma vez a mesma consulta sem esse campo.

### Q6 · volume de pedidos (R6)
```graphql
query Q6 {
  ordersCount(query: "test:false AND processed_at:>='2026-07-25'", limit: null) { count precision }
}
```
Retorna: um número (pedidos não-teste dos últimos 90 dias) e se é exato. Dado pessoal: nenhum.

### Nota de risco
- **`tags` excluído:** em algumas lojas, apps gravam dados do cliente nas tags. Se Q2 não mostrar onde fica o número do pedido Cartpanda, peço autorização separada para ler `tags` só de 3 pedidos, sabendo do risco.
- **Escopo do conector:** ele age com as permissões da conta conectada. Se alguma consulta devolver erro de acesso, paro e registro; não tento outro caminho.
- **Valores financeiros** (totais, custos) não são dados pessoais, mas são sensíveis para o negócio. Ficam só nesta sessão e em conclusões agregadas.

**Fora do conector, a seu critério:**
- H1: ver no Dev Dashboard se a loja aparece na organização.
- L20: ver se a fatura da Shopify tem "taxas de transação".

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

---

## 10. Rodada mínima (pedido de 23/10/2026: nada além do necessário)

Atende às prioridades 1, 2, 3 e 4 com o menor esforço. As listas completas das seções 4 e 5 só são pedidas se esta rodada não fechar a questão.

| # | Item | Responde a | Esforço estimado |
|---|---|---|---|
| M1 | **10 pedidos de um mês fechado na Único Drop**, com o detalhamento que ela mostra (receita, custo do produto, frete, taxas, publicidade, lucro), por exportação ou captura, **com dados de cliente ocultos**. Mistura sugerida: cartão à vista, cartão parcelado, Pix e, se houver, um com reembolso | Prioridades 1 e 2 | 10–15 min |
| M2 | **Uma ou duas capturas das configurações da Único Drop** onde ficam taxas, custos e publicidade | Prioridade 1: o que é real e o que é estimado | 5 min |
| M3 | **Cartpanda: captura da lista de colunas da Exportação Avançada de pedidos** (só a tela de escolha de colunas, sem gerar arquivo). Se houver coluna de taxa ou recebível: exportar os mesmos 10 pedidos só com número, método, parcelas, bruto e taxa/recebível | Prioridade 3 e os componentes de taxa da prioridade 1 | 5–10 min |
| M4 | **Três perguntas ao suporte da Único Drop** (texto abaixo) | Prioridades 1 e 4 | 2 min para enviar |
| M5 | **Suas decisões-alvo:** marque quais decisões você quer tomar com o lucro por pedido (lista abaixo) | Prioridade 2 | 2 min |

**Texto para o suporte da Único Drop (M4):**

> Olá! Três dúvidas sobre o lucro por pedido:
> 1. Quando altero o custo de um produto, os pedidos antigos mantêm o custo da época ou passam a usar o custo novo?
> 2. A taxa de pagamento de cada pedido vem do valor real cobrado pela Cartpanda Pay ou de um percentual que eu configuro?
> 3. Como o gasto de anúncios é distribuído entre os pedidos (por dia, por campanha, igualmente)?
>
> Obrigada!

**Decisões-alvo (M5), marque as que importam:**
- [ ] Manter, cortar ou repor um produto (margem por produto)
- [ ] Ajustar preço ou desconto de um produto
- [ ] Escalar ou pausar uma campanha (resultado depois do anúncio por campanha)
- [ ] Definir o CPA máximo aceitável por produto
- [ ] Oferecer frete grátis, parcelamento sem juros ou Pix com desconto
- [ ] Saber o lucro real do mês
- [ ] Outra: ________

**Ainda não peço** (só se M1–M3 mostrarem necessidade):
- taxas contratadas do Cartpanda Pay e configuração de parcelamento (só se M3 mostrar que a taxa por pedido não é exportável);
- CSV de cobranças;
- extrato;
- planos;
- arquivos de produtos.
