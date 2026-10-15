# Bárbara de feltro: imagem-mestra (fazer uma vez)

A imagem-mestra é o ativo de marca: o mesmo personagem em todos os vídeos. O motor de feltro (Runway Act-Two) aplica nela a sua boca, as expressões e os gestos de cada gravação. A aparência da boneca vem da imagem. Do vídeo vêm só o movimento e a fala.

**Status:** aprovada em 15/10/2026 (app Gemini). Está em `public/feltro/mestra.png`, com o registro em `public/feltro/biblia.json`.

## Passo a passo

1. **Foto de referência.** Use um dos quadros que o Claude extrai da sua gravação (frente, olhos abertos, boca quase fechada), ou tire uma foto nova: de frente, do meio do peito para cima, luz de janela, fundo liso.
2. **Onde gerar (grátis):**
   - app **Gemini**: peça para criar imagem (Nano Banana) e anexe a foto;
   - ou **ChatGPT**: anexe a foto e peça uma imagem.
3. **Cole o prompt** abaixo e gere de 3 a 4 versões. Escolha a que mais parece você.
4. **Baixe em alta resolução** e mande para o Claude no chat. Ele salva em `public/feltro/mestra.png` e registra o prompt e a data em `public/feltro/biblia.json`.

## Prompt (inglês funciona melhor para textura)

> Transform the woman in the attached photo into a handmade needle-felted wool doll portrait. Adult proportions (not a child, not chibi, head not oversized). Keep her face shape, strong dark eyebrows, long dark-brown wavy hair with a center part, and her calm, warm expression.
> Materials: soft felted wool skin in warm beige with visible fuzzy fibers; hair made of wool yarn strands; small dark glass-bead eyes with felt eyelids; felted eyebrows; a small felt mouth, slightly open, with a dark inner mouth and no teeth.
> Clothes: a moss-green (#3f493d) wool knit top with a simple neckline.
> Background: a plain miniature felt set in cream (#f7f4ee) with one soft terracotta (#b85f42) felt shape, soft natural window light from the left.
> Framing: vertical 9:16, chest-up, facing the camera, head centered, same head size and position as in the photo, eyes open looking at the lens, no hands, no props, no text, no logo.
> Style: stop-motion studio photography, shallow depth of field, calm and elegant mood.

## Ajustes (cole depois, na mesma conversa)

- **Parece assustadora ou realista demais:** "Make the face simpler and more handmade, with softer rounded shapes and less realistic skin."
- **Olhos grandes ou fofos demais:** "Smaller bead eyes, more adult and serene."
- **Não parece você:** anexe uma segunda foto e diga "Match her face more closely (nose, jaw, smile)."
- **Cabelo cobrindo o rosto:** "Hair pulled behind the shoulders, face fully visible."

## Checklist de aprovação

1. Parece com você, em versão feltro.
2. Proporção adulta (olhos pequenos, cabeça não exagerada).
3. **Boca visível, levemente aberta, com o interior escuro.** Boca fechada ou bordada não mostra a fala.
4. Os dois olhos abertos e visíveis; cabelo fora do rosto.
5. Vertical 9:16, do meio do peito para cima, centralizada.
6. Nada na mão, nenhum produto, texto ou logo. Se aparecer uma marca no canto, avise o Claude, que recorta.

## Por que assim (Runway Act-Two)

- A imagem precisa ter um rosto reconhecível, de frente e bem visível, e uma pose parecida com a do vídeo (mesmo enquadramento e tamanho de cabeça).
- O trecho de performance tem de 3 a 30 segundos.
- O custo é de 5 créditos por segundo gerado (cerca de US$ 0,05 pela API). O plano grátis da Runway não inclui o Act-Two: é preciso o plano Standard ou superior, ou créditos pela API.

## Vídeo feito direto no Gemini não serve para o anúncio

O Gemini cria o vídeo e também uma voz nova a partir do texto. Essa voz não é a da Bárbara, então quebra a regra da voz real. No teste de 15/10 o vídeo também saiu horizontal e com objetos inventados nas mãos. Serve só como referência de personagem.

O motor de feltro precisa partir da gravação real:

- **Runway Act-Two (automático):** usa o vídeo dela como guia de rosto e gestos. Roda na fábrica com `--motor runway`.
- **Imagem + áudio (teste manual):** uma ferramenta anima a imagem-mestra a partir da voz real (ex.: OmniHuman no ElevenLabs, ou Hedra). Entram `mestra.png` e o MP3 do trecho. O vídeo que volta precisa ter a mesma duração do áudio, e o Claude encaixa na versão B.
