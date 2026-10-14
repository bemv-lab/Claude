# Rocco Kids · vídeos da Tília (Remotion)

A Tília é a anfitriã da Rocco: uma lupa de leitura com cabo de madeira. Ela apresenta os produtos falando com os pais, e a lente mostra ampliado exatamente o que está embaixo dela.

## O que tem aqui

| Caminho | O que é |
|---|---|
| `src/turminha/kit/` | Kit compartilhado de toda a turminha: rosto, 10 bocas, piscadas, sobrancelhas e braços (IK). Um personagem novo é só uma silhueta nova usando o mesmo kit. |
| `src/turminha/Tilia.tsx` | A Tília, a lupa `Lupa` e a `LenteAssinatura`. |
| `src/video/roteiro.ts` | Roteiro do vídeo 1 (Pasta de Descobertas), cena a cena. |
| `src/video/TiliaPasta.tsx` | As 8 cenas. A cronometragem vem das palavras da voz. |
| `src/video/FolhaTilia.tsx` | Folha de modelo da Tília (still). |
| `src/produto/PastaIlustrada.tsx` | **Ilustração provisória** da pasta. No anúncio entra a foto real. |
| `scripts/voz_elevenlabs.py` | Gera a locução no ElevenLabs já com o alinhamento por caractere. |
| `scripts/build_lipsync.py` | Transforma voz + alinhamento em bocas por frame e tempos de palavra para a legenda. |
| `scripts/tts_espeak_teste.py` | Voz robótica offline, só para teste de ritmo (nunca vai ao ar). |

## Trocar a voz de teste pela do ElevenLabs

1. Configure o ambiente: cadastre `ELEVENLABS_API_KEY` como secret e libere `api.elevenlabs.io` na rede. Depois abra uma sessão nova.
2. Gere a voz e as bocas:
   ```bash
   python3 -I scripts/voz_elevenlabs.py --voice <voice_id> --text-file roteiro-pasta.txt --out public/voz/tilia-pasta
   python3 -I scripts/build_lipsync.py --audio public/voz/tilia-pasta.mp3 \
     --timing public/voz/tilia-pasta.alignment.json --text "$(cat roteiro-pasta.txt)" --out src/data/fala-tilia.json
   ```
   **Sem chave:** gere o MP3 no site do ElevenLabs, salve em `public/voz/` e rode o `build_lipsync.py` sem `--timing`. A boca passa a seguir o volume do áudio, um pouco menos precisa.
3. Em `src/Root.tsx`, troque o import `./data/fala-teste.json` pelo novo JSON e `audio` pelo arquivo novo. Também mude `prototipo` para `false` quando o produto já estiver em foto real.

A duração do vídeo e o início de cada cena se ajustam sozinhos à voz.

## Renderizar

O download do Chrome do Remotion é bloqueado neste ambiente, por isso os comandos usam o Chromium do Playwright:

```bash
B=/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell
npx remotion render src/index.ts Tilia-Pasta out/tilia-pasta.mp4 --browser-executable=$B --concurrency=4 --crf=20
npx remotion still src/index.ts Tilia-Folha out/folha-tilia.png --browser-executable=$B
# áudio no padrão de Reels/Meta (-14 LUFS) e MP4 pronto para streaming
python3 -I scripts/finalizar_audio.py out/tilia-pasta.mp4 out/tilia-pasta-final.mp4
```

## Regras que o vídeo segue

O vídeo segue o Manual de Linguagem da Rocco e as regras de publicidade infantil:

- fala sempre com o adulto;
- a Tília se identifica como personagem animada;
- o produto aparece só em foto real e nunca é deformado (a lente só amplia o que está embaixo dela).
