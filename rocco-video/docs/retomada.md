# Retomada da fábrica (feltro com a Runway)

## Onde paramos (15/10)

- A Bárbara pediu três ajustes no vídeo da Pasta (roteiro 07). Feitos na madrugada, sem gasto:
  - **pausas de leitura cortadas:** de 51,5 s para 28,8 s de fala, com 9 cortes secos e zoom alternado em cada um;
  - **legenda nova:** altura do peito, 20% maior, uma ou duas palavras por vez, com entrada dinâmica;
  - **fotos sem fundo:** recorte local em `public/produto/pasta-de-descobertas/tratadas/`, sobre o creme da marca. Falta ela aprovar ou pedir a melhoria no Gemini.
- Nova versão C em `out/lotes/2026-10-15/barbara-pasta/` (enviada no chat; `out/` não vai para o git). Para refazer: rodar o lote com `--remover-palavras "ábaco e"`.
- Imagem-mestra de feltro aprovada: `public/feltro/mestra.png`.
- **Ábaco a confirmar:** a descrição do Shopify cita "ábaco de contas coloridas", mas nenhuma das 4 fotos mostra ábaco (o que parece contas é um calendário de 1 a 31). Até ela confirmar no produto, a palavra fica fora dos roteiros e sai da fala com `--remover-palavras "ábaco e"` (com o "e", porque na fala ele vem emendado). Se a Pasta não tiver ábaco, a descrição do Shopify também precisa mudar.
- Chaves da Runway e do Gemini cadastradas pela Bárbara em "Segredos de rede" (15/10). Só valem em sessão nova.

## Checklist da Bárbara

1. **Runway pela API** (dev.runwayml.com, não o plano mensal do app):
   - crie a conta, compre créditos (mínimo US$ 10 = 1.000 créditos) e crie uma chave de API;
   - os créditos do plano mensal do app não valem na API, então não precisa assinar o plano.
2. **Chave do Gemini:** aistudio.google.com → Get API key → Create API key.
3. **Configurações do ambiente do Claude** (menu do ambiente na barra de título da sessão → "Editar ambiente de nuvem"; se não aparecer no iPhone, faça pelo computador em claude.ai/code):
   - **Segredos de rede → "+ Adicionar segredo":** um para cada chave, com a chave no valor:
     - nome `RUNWAYML_API_SECRET` (domínio, se pedir: `api.dev.runwayml.com`);
     - nome `GEMINI_API_KEY` (domínio, se pedir: `generativelanguage.googleapis.com`);
   - **Acesso à rede:** o menu estava em "Confiável" e, nesse nível, a Runway fica bloqueada (testado em 15/10). Escolha a opção que mostra "Domínios permitidos" (Limitado ou Personalizado) e adicione `api.dev.runwayml.com`, deixando marcada a caixa dos gerenciadores de pacotes. O Gemini já passa;
   - **Script de configuração:** deixe vazio. O Claude instala o transcritor dentro da sessão (passo 0 abaixo). Não toque em "Arquivar ambiente".
4. **Abra uma sessão nova** nesse ambiente (as chaves só valem em sessão nova). Anexe de novo o vídeo original da Pasta (pelo app Fotos) e escreva, já com o teto de gasto: "Retomar a fábrica (docs/retomada.md). Pode gastar até US$ 3 na Runway neste vídeo."

Nunca cole chave no chat.

## O que o Claude faz na retomada

0. Instala o transcritor e as dependências: `bash rocco-video/scripts/setup_ambiente.sh` (pip sherpa-onnx, modelo Parakeet em `/opt/asr`, `npm ci`). Leva alguns minutos.
1. Testa as duas chaves sem gastar. A Runway entrega o vídeo por outro endereço (CDN): se o download for bloqueado, diz qual endereço liberar.
2. Fotos: se ela aprovar os recortes locais, já estão em uso. Se quiser melhorar além do recorte (luz, nitidez), trata no Gemini com o produto igual ao original e mostra antes e depois. Custo: centavos de dólar por foto.
3. Processa o vídeo com `--motor runway --teto-usd <teto que ela disse na mensagem>` (sem teto dito, pergunta uma vez antes de começar; nunca gasta sem o OK dela) (e `--remover-palavras "ábaco e"` se o ábaco não for confirmado): versões A, B e C com pausas cortadas e legenda nova. Custo: US$ 0,05 por segundo em feltro (vídeo de ~29 s, A e B juntas: ~US$ 1,50).
4. Entrega os MP4 e o resumo. Nada é publicado.
