# Retomada da fábrica (manhã de 16/10/2026)

## Onde paramos (15/10)

- Vídeo da Pasta de Descobertas (roteiro 07) processado na versão C (rosto real). A Bárbara pediu três ajustes:
  - cortar as pausas de leitura;
  - legenda na altura do peito, 20% maior, uma ou duas palavras por vez;
  - fotos do produto tratadas, sem fundo.
- Imagem-mestra de feltro aprovada: `public/feltro/mestra.png`.
- Ábaco confirmado na descrição do Shopify (roteiros 06 e 07 corrigidos).
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
2. Trata as fotos da Pasta no Gemini: fundo removido, luz e nitidez, produto igual ao original. Mostra antes e depois para aprovação. Custo: centavos de dólar por foto.
3. Processa o vídeo com `--motor runway --teto-usd 10`: versões A, B e C com pausas cortadas e legenda nova. Custo: US$ 0,05 por segundo em feltro (vídeo de ~35 s, A e B juntas: ~US$ 2).
4. Entrega os MP4 e o resumo. Nada é publicado.
