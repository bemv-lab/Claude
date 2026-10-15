# Retomada da fábrica (feltro com a Runway + fotos no Gemini)

## Onde paramos (15/10, tarde)

Pedidos da Bárbara para o vídeo da Pasta (roteiro 07), em ordem:

1. **Ela aparece como a boneca de feltro** da imagem-mestra (`public/feltro/mestra.png`). A versão A (feltro inteiro) é a principal; B (feltro no começo e no fim) e C (rosto real) vão como alternativas.
2. **Legenda logo abaixo do pescoço**, sem tampar a interface do Reels (coluna de ícones da direita e faixa de baixo). **Feito e conferido na versão C** (sem gasto): a fábrica mede o rosto em cada versão e posiciona sozinha. No feltro, foi conferido com a mestra parada no lugar da Runway.
3. **Fotos do produto tratadas no Gemini** antes de entrar no vídeo: foto profissional, mais bonita, sem perder nenhuma característica do produto real. Script pronto: `scripts/tratar_fotos_gemini.py`. **Falta rodar** (precisa da chave).
4. **Sem cartão final** (nada de site ou nome do produto no fim): o vídeo termina nela, falando "O link está aqui embaixo.". **Feito.** O "Vale olhar de perto" agora mostra a foto fechada em tela cheia (antes era uma janela que tampava o rosto); roteiros 01 e 03 também saíram da janela.

Verificado sem gastar (15/10): versão C nova; versões A e B com um "feltro de mentira" (a mestra parada no lugar da Runway, nenhuma chamada à API): legenda medida abaixo do pescoço e fora das zonas do Reels nas três, aviso de IA presente, fim na boneca, produto só em foto real. Corrigidos na mesma rodada: piscada do rosto entre duas fotos seguidas, zoom 1 quadro atrasado em alguns cortes, foto em tela cheia entrando na coluna de ícones, selo e assinatura altos demais (agora a partir de 270 px), e proteções na medida do pescoço. O script do Gemini foi testado com uma API falsa (19 cenários); o formato real do pedido só se confirma no primeiro pedido pago.

Também ficou valendo: pausas cortadas (51,5 s → 29,1 s de fala), "ábaco e" fora da fala (`--remover-palavras "ábaco e"`, até ela confirmar o ábaco no produto), aviso de IA na assinatura do começo e no selo "animação com IA" o vídeo todo.

**Por que não saiu o feltro nesta sessão:** a rede já libera a Runway (`api.dev.runwayml.com` e o CDN `dnznrvs05pmza.cloudfront.net`), mas as chaves foram passadas de "Variáveis de ambiente" para "Segredos de rede", e segredo de rede só vale em sessão nova (aqui a Runway respondeu 401 "No API key" e o Gemini 403 sem chave).

## Checklist da Bárbara (antes da sessão nova)

1. **Segredos de rede** (menu do ambiente → "Editar ambiente de nuvem" → "Segredos de rede"), um por chave:
   - **Runway:** site `api.dev.runwayml.com`; cabeçalho `Authorization` com prefixo `Bearer` (o padrão do formulário); valor = a chave da Runway.
   - **Gemini:** site `generativelanguage.googleapis.com`; cabeçalho **`x-goog-api-key`**, **sem prefixo** (apague o "Bearer"); valor = a chave do Gemini. Com "Bearer" o Gemini recusa a chave.
   - Se o formulário for o curto (só "Host" e "Token"), avise o Claude: ele testa na sessão nova e diz se passou.
2. **Acesso à rede:** "Personalizado", com `api.dev.runwayml.com` e `dnznrvs05pmza.cloudfront.net` em "Domínios permitidos" e a caixa dos gerenciadores de pacotes marcada (já está assim).
3. **Abra uma sessão nova**, anexe de novo o vídeo da Pasta (de preferência o original pelo Google Drive, pasta "Rocco Vídeos/1-Entrada": o anexo pelo app chegou reduzido a 576x1024) e escreva, já com o teto:
   "Retomar a fábrica (docs/retomada.md). Pode gastar até US$ 4 (Runway + Gemini)."

Nunca cole chave no chat.

## O que o Claude faz na retomada

0. `bash rocco-video/scripts/setup_ambiente.sh` (Parakeet, OpenCV da legenda, `npm ci`; alguns minutos).
1. **Testa as chaves sem gastar:** `GET https://api.dev.runwayml.com/v1/organization` (header `X-Runway-Version: 2024-11-06`; mostra o saldo de créditos) e `GET https://generativelanguage.googleapis.com/v1beta/models`. Sem chave no ambiente, o proxy injeta o segredo de rede: 200 = ok; 401/403 = segredo não chegou (ver checklist, item 1).
2. **Fotos no Gemini** (só as que o roteiro usa: `aberta.jpg`, `aberta2.jpg`, `fechada.jpg`; `dinossauros.jpg` só quando um roteiro usar):
   - `python3 -I scripts/tratar_fotos_gemini.py gerar public/produto/pasta-de-descobertas/{aberta,aberta2,fechada}.jpg --variantes 1 --teto-usd <parte do teto>` (modelo padrão `gemini-3-pro-image`: US$ 0,134 por foto mais o "thinking"; o teto conta US$ 0,25 por pedido, então 3 fotos = até US$ 0,75);
   - olha `public/produto/pasta-de-descobertas/tratadas/gemini/comparar-<nome>.jpg` **peça por peça** contra a original (letras, números, zíperes, botões, fivelas, cadarços, relógio, alças, cores, posições, quantidade). Se mudou qualquer coisa do produto, gera outra variante; se nenhuma ficar fiel, fica o recorte local e isso vai no resumo;
   - `python3 -I scripts/tratar_fotos_gemini.py promover public/produto/pasta-de-descobertas/tratadas/gemini/<nome>-<k>.png` na aprovada (recorta o fundo e grava `tratadas/<nome>.png`, que a fábrica usa) e manda o antes e depois para ela.
3. **Lote com feltro:** `python3 -I scripts/processar_lote.py --entrada <pasta> --lote <AAAA-MM-DD> --motor runway --teto-usd <teto menos o gasto do Gemini> --remover-palavras "ábaco e"`. São 3 trechos de 8 a 11 s (A e B saem do mesmo gasto): US$ 0,05 por segundo, ~US$ 1,46 para 29 s.
4. **Confere** 6 a 8 quadros por versão: boca fechando em p, b e m; mãos sem defeito; legenda logo abaixo do pescoço e fora das zonas do Reels; fim nela (real ou feltro), sem cartão; produto só em foto real; aviso de IA nas versões A e B.
5. **Entrega** A (principal), B e C com o resumo: o que saiu, avisos, gasto em US$ (Gemini + Runway). Nada é publicado; no Metricool, só rascunho e só com o OK dela.
