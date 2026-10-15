# Retomada da fábrica (manhã de 16/10/2026)

## Onde paramos (15/10)

- A Bárbara pediu três ajustes no vídeo da Pasta (roteiro 07). Feitos na madrugada, sem gasto:
  - **pausas de leitura cortadas:** de 51,5 s para 28,8 s de fala, com 9 cortes secos e zoom alternado em cada um;
  - **legenda nova:** altura do peito, 20% maior, uma ou duas palavras por vez, com entrada dinâmica;
  - **fotos sem fundo:** recorte local em `public/produto/pasta-de-descobertas/tratadas/`, sobre o creme da marca. Falta ela aprovar ou pedir a melhoria no Gemini.
- Nova versão C em `out/lotes/2026-10-15/barbara-pasta/` (enviada no chat; `out/` não vai para o git). Para refazer: rodar o lote com `--remover-palavras "ábaco e"`.
- Imagem-mestra de feltro aprovada: `public/feltro/mestra.png`.
- **Ábaco a confirmar:** a descrição do Shopify cita "ábaco de contas coloridas", mas nenhuma das 4 fotos mostra ábaco (o que parece contas é um calendário de 1 a 31). Até ela confirmar no produto, a palavra fica fora dos roteiros e sai da fala com `--remover-palavras "ábaco e"` (com o "e", porque na fala ele vem emendado). Se a Pasta não tiver ábaco, a descrição do Shopify também precisa mudar.
- Runway e Gemini ainda sem chave neste ambiente.

## Checklist da Bárbara

1. **Runway pela API** (dev.runwayml.com, não o plano mensal do app):
   - crie a conta, compre créditos (mínimo US$ 10 = 1.000 créditos) e crie uma chave de API;
   - os créditos do plano mensal do app não valem na API, então não precisa assinar o plano.
2. **Chave do Gemini:** aistudio.google.com → Get API key → Create API key.
3. **Configurações do ambiente do Claude** (menu do ambiente na barra de título da sessão → Edit; se não aparecer no iPhone, faça pelo computador em claude.ai/code):
   - em Network secrets (ou, se não houver, variáveis de ambiente):
     - `RUNWAYML_API_SECRET` = chave da Runway;
     - `GEMINI_API_KEY` = chave do Gemini;
   - em Network access → Allowed domains, adicione `api.dev.runwayml.com` e deixe "Allow package managers" marcado (o Gemini já passa);
   - em Setup script, cole o conteúdo de `rocco-video/scripts/setup_ambiente.sh`.
4. **Abra uma sessão nova** nesse ambiente (as chaves só valem em sessão nova). Anexe de novo o vídeo original da Pasta e escreva: "Retomar a fábrica (docs/retomada.md)".

Nunca cole chave no chat.

## O que o Claude faz na retomada

1. Testa as duas chaves sem gastar. Se o download do vídeo da Runway for bloqueado, diz qual endereço liberar.
2. Fotos: se ela aprovar os recortes locais, já estão em uso. Se quiser melhorar além do recorte (luz, nitidez), trata no Gemini com o produto igual ao original e mostra antes e depois. Custo: centavos de dólar por foto.
3. Processa o vídeo com `--motor runway --teto-usd 10` (e `--remover-palavras "ábaco e"` se o ábaco não for confirmado): versões A, B e C com pausas cortadas e legenda nova. Custo: US$ 0,05 por segundo em feltro (vídeo de ~29 s, A e B juntas: ~US$ 1,50).
4. Entrega os MP4 e o resumo. Nada é publicado.
