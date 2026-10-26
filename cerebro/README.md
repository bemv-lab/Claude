# Cérebro Rocco

O sistema da Rocco Kids: precificação, financeiro com DRE, taxas e gatilhos de plano, esteira de campanhas da Meta e a memória compartilhada que qualquer conversa com o Claude consulta. Plano completo e fases: `PLANO.md`.

## O que já funciona (v0.1)

| Tela | O que faz |
|---|---|
| Início | faturamento, pedidos, ticket médio, resultado e ROAS real do mês; alertas (gatilho de plano, DAS, anúncios para pausar ou escalar, taxas de exemplo) |
| Precificação | por produto: margem de contribuição, lucro por pedido, CPA máximo e ROAS de break-even, com DAS, plataforma, mix real de parcelamento e imposto da Meta; "que preço dá a margem que eu quero" |
| Financeiro e DRE | lançamentos por conta e DRE do mês (Simples Nacional, comércio); gasto de mídia copiado do Gerenciador ganha o imposto da Meta lançado junto |
| Taxas e planos | DAS, plataforma, imposto Meta, taxa e % de pedidos por forma de pagamento, planos com gatilho de pedidos/mês |
| Campanhas | importa o CSV do Gerenciador e classifica cada anúncio em teste, validação, escala ou pausar, com regras tiradas da precificação |
| Memória | decisões e aprendizados com data, área e autor |

Conector MCP `rocco-cerebro` (7 ferramentas): `contexto_rocco`, `buscar_memoria`, `registrar_memoria`, `precificar`, `dre`, `lancar`, `avaliar_campanhas`.

Tecnologia: Next.js 15 + SQLite embutido no Node 22 (um arquivo, `dados/cerebro.db`; backup é copiar o arquivo). Para duas pessoas e milhares de lançamentos, SQLite sobra; se um dia precisar, a troca por Postgres fica só em `lib/db.ts`.

## Rodar no computador (Mac ou Windows)

Precisa do Node 22.13 ou mais novo (nodejs.org).

```bash
cd cerebro
npm ci
npm run usuario -- barbara@email.com "Bárbara" uma-senha-forte
npm run usuario -- lucas@email.com "Lucas" outra-senha-forte
npm run build && npm start   # abre em http://localhost:3000
```

Os dados ficam em `cerebro/data/cerebro.db`.

## Hospedar para você e o Lucas (Oracle Cloud, grátis)

1. Crie a conta na Oracle Cloud (Always Free) e uma VM **Ampere A1** (ARM) com Ubuntu, 2 OCPU e 12 GB já sobram.
2. Na VM: instale o Docker (`curl -fsSL https://get.docker.com | sh`), clone este repositório e entre em `cerebro/`.
3. `cp .env.exemplo .env` e preencha `CEREBRO_SEGREDO` (uma frase longa e aleatória).
4. Acesso seguro sem abrir portas, pela Cloudflare (grátis):
   - Cloudflare Zero Trust → Networks → Tunnels → criar túnel → copiar o token para `TUNNEL_TOKEN` no `.env`;
   - no túnel, "Public hostname": `cerebro.seudominio.com.br` → `http://cerebro:3000`;
   - Access → Applications → proteger esse endereço, liberando só o seu e-mail e o do Lucas (código por e-mail).
5. `docker compose up -d --build`
6. Usuários: `docker compose exec cerebro npm run usuario -- barbara@email.com "Bárbara" senha`.
7. Backup diário (crontab da VM):
   `0 3 * * * cd ~/Claude/cerebro && docker compose exec -T cerebro npm run -s backup`
   As cópias ficam em `dados/backups` (as 30 últimas). Para mandar ao Google Drive, use o `rclone` com uma pasta "Rocco/Backups".

## Ligar o Claude ao Cérebro (fim dos chats soltos)

No Claude Code, no computador onde o banco está:

```bash
claude mcp add rocco-cerebro -e CEREBRO_DB=$PWD/data/cerebro.db -- node $PWD/node_modules/tsx/dist/cli.mjs $PWD/mcp/server.ts
```

Com o Cérebro na Oracle, o seu computador usa o banco de lá por SSH:

```bash
claude mcp add rocco-cerebro -- ssh ubuntu@IP-DA-VM "cd Claude/cerebro && docker compose exec -T cerebro node node_modules/tsx/dist/cli.mjs mcp/server.ts"
```

Depois, em qualquer conversa: "olhe o contexto da Rocco" ou "registre na memória que…". O acesso pelo claude.ai e pelo celular (conector remoto com login) é o próximo passo da fase 0.

## Testes

`npm run testar` confere as contas (taxa média, margem, CPA máximo, preço para margem, esteira, DRE, leitura do CSV da Meta).
