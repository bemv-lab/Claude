# Bárbara de feltro: imagem-mestra (fazer uma vez)

A imagem-mestra é o ativo de marca: o mesmo personagem em todos os vídeos. O motor de feltro
(Runway Act-Two) aplica nela a sua boca, expressões e gestos de cada gravação.

## 1. Fotos (5 min)

Tire 4 fotos com a mesma roupa e penteado que vai usar nas gravações:

- de frente, rosto neutro;
- de frente, falando;
- 3/4;
- sorriso leve.

Use luz de janela, fundo liso e enquadramento do meio do peito para cima. Roupa lisa na paleta da Rocco (musgo, terracota, creme ou grafite), sem estampa nem logo.

## 2. Gerar (grátis nos apps, ~20 min)

No app Gemini (Nano Banana) ou no ChatGPT, anexe a foto de frente e use um dos prompts abaixo.
Gere 3 a 4 de cada e escolha a que mais parece você.

### Prompt A: ateliê (recomendado)
> Transform the person in this photo into a handmade needle-felted wool doll portrait, adult woman proportions (not a child, not chibi), same face shape, hairstyle and outfit. Visible fuzzy wool fibers, hair made of soft wool yarn, small black bead eyes with felt eyelids, embroidered eyebrows, a visible felt mouth slightly open with a dark inner mouth (no teeth), felt hands. Calm, warm, intelligent expression. Background: a miniature felt set in cream (#f7f4ee) with subtle terracotta (#b85f42) and moss green (#3f493d) accents, soft natural window light from the left. Vertical 9:16, chest-up framing, eyes on the upper third, facing the camera. Stop-motion studio photography, shallow depth of field. No text, no logo, no toys in the scene.

### Prompt B: mais realista (textura forte, rosto mais fiel)
> Same as A, but keep the facial features closer to the photo (nose, jaw, smile), wool texture still clearly visible, felted skin with tiny fibers, glass bead eyes with a gentle highlight.

### Prompt C: mais lúdico (mantendo o tom adulto)
> Same as A, with slightly rounder felt shapes and visible hand stitching on the clothes; colors muted, elegant, never cartoonish or childish.

## 3. Regras de aprovação

- **Boca de feltro visível e entreaberta:** se a boca for bordada fechada, a fala não aparece no vídeo.
- **Proporções adultas e olhos pequenos:** olhos grandes e cabeça grande puxam para "boneco infantil" (Res. CONANDA 163).
- **Nada na mão e nenhum produto na cena:** o produto entra sempre como imagem real.
- **Enquadramento igual ao das gravações:** do meio do peito para cima, de frente.

Mande a escolhida no chat. O Claude salva em `public/feltro/mestra.png`, gera as variações e registra o prompt, o modelo e a data em `public/feltro/biblia.json`.
