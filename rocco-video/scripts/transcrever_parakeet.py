"""Transcreve pt-BR localmente com Parakeet-TDT-0.6B-v3 (sherpa-onnx) e gera palavras.json
no formato do projeto: [{"text","start","end"}], pontuação colada na palavra.
Opcional: --roteiro arquivo.txt usa a grafia do roteiro nos trechos que batem com a fala (difflib) e
imprime a concordância fala x roteiro (abaixo de ~88% indica áudio ruim ou improviso: revisar ou mandar para a nuvem).
uso: python -I palavras_parakeet.py --audio voz.wav --modelo DIR --saida palavras.json [--roteiro r.txt] [--threads 4]"""
import argparse, difflib, json, re, subprocess, time, unicodedata
import numpy as np, sherpa_onnx

ap = argparse.ArgumentParser()
ap.add_argument('--audio', required=True); ap.add_argument('--modelo', required=True)
ap.add_argument('--saida', required=True); ap.add_argument('--roteiro'); ap.add_argument('--threads', type=int, default=4)
a = ap.parse_args()

# qualquer áudio/vídeo -> PCM 16 kHz mono via ffmpeg
pcm = subprocess.run(['ffmpeg', '-v', 'error', '-i', a.audio, '-ac', '1', '-ar', '16000', '-f', 's16le', '-'],
                     capture_output=True, check=True).stdout
x = np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768.0
t0 = time.time()
rec = sherpa_onnx.OfflineRecognizer.from_transducer(
    encoder=f'{a.modelo}/encoder.int8.onnx', decoder=f'{a.modelo}/decoder.int8.onnx', joiner=f'{a.modelo}/joiner.int8.onnx',
    tokens=f'{a.modelo}/tokens.txt', num_threads=a.threads, model_type='nemo_transducer')
t1 = time.time()
st = rec.create_stream(); st.accept_waveform(16000, x); rec.decode_stream(st); r = st.result
t2 = time.time()
toks, ts = list(r.tokens), list(r.timestamps)
du = list(getattr(r, 'durations', []) or [0.08] * len(toks))
# tokens -> palavras: token que começa com espaço abre palavra nova; pontuação gruda na anterior
words, abre = [], True
for tok, s, d in zip(toks, ts, du):
    if tok.strip() == '':          # token só de espaço (ex.: antes de números): a próxima peça abre palavra
        abre = True; continue
    if tok.startswith(' ') or abre or not words:
        words.append(dict(text=tok.strip(), start=float(s), end=float(s + d)))
    else:                          # continuação da palavra (sub-palavra ou pontuação)
        words[-1]['text'] += tok; words[-1]['end'] = max(words[-1]['end'], float(s + d))
    abre = False
# fim da palavra = início da próxima quando ficam coladas (evita sobreposição)
for i in range(len(words) - 1):
    words[i]['end'] = min(words[i]['end'], words[i + 1]['start'])

if a.roteiro:
    # legenda com a grafia do roteiro e os tempos da fala real: alinha palavra a palavra (difflib);
    # trechos trocados que se parecem (>=50% dos caracteres e tamanho parecido) viram o texto do roteiro, com o tempo
    # do trecho dividido proporcionalmente ao tamanho das palavras; improvisos ficam como foram ditos.
    def core(w): return re.sub(r'[^\w]', '', unicodedata.normalize('NFKC', w).lower())
    ref = open(a.roteiro, encoding='utf-8').read().split()
    sm = difflib.SequenceMatcher(a=[core(w['text']) for w in words], b=[core(w) for w in ref], autojunk=False)
    iguais = sum(b.size for b in sm.get_matching_blocks())
    concordancia = iguais / max(1, len(ref))
    print(f'concordancia fala x roteiro: {100*concordancia:.1f}%')
    out, trocas = [], 0
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        seg_asr, seg_ref = words[i1:i2], ref[j1:j2]
        if tag == 'equal':
            for w, rw in zip(seg_asr, seg_ref): out.append(dict(text=rw, start=w['start'], end=w['end']))
            continue
        parecido = difflib.SequenceMatcher(a=' '.join(core(w['text']) for w in seg_asr), b=' '.join(core(rw) for rw in seg_ref)).ratio()
        # tamanho parecido também: se o roteiro tem bem mais letras, ela pulou palavras ("telas" != "tela, com alças")
        proporcao = sum(len(core(rw)) for rw in seg_ref) / max(1, sum(len(core(w['text'])) for w in seg_asr))
        if tag == 'replace' and parecido >= 0.5 and 0.7 <= proporcao <= 1.4:
            ini, fim = seg_asr[0]['start'], seg_asr[-1]['end']
            pesos = [max(1, len(core(rw))) for rw in seg_ref]; tot = sum(pesos); acc = ini
            for rw, pw in zip(seg_ref, pesos):
                dur = (fim - ini) * pw / tot; out.append(dict(text=rw, start=acc, end=acc + dur)); acc += dur
            trocas += len(seg_ref)
        elif tag == 'replace':
            # palavra a palavra, na ordem: a palavra dita pega a grafia da palavra do roteiro mais parecida
            # ("cadastros" -> "cadarços"); palavra do roteiro sem par fica de fora (não foi dita)
            j = 0
            for w in seg_asr:
                melhor, nota = None, 0.6
                for jj in range(j, len(seg_ref)):
                    sim = difflib.SequenceMatcher(a=core(w['text']), b=core(seg_ref[jj])).ratio()
                    if sim > nota:
                        melhor, nota = jj, sim
                if melhor is None:
                    out.append(w)  # fala fora do roteiro: mantém o que foi dito
                else:
                    out.append(dict(text=seg_ref[melhor], start=w['start'], end=w['end'])); trocas += 1; j = melhor + 1
        elif tag == 'delete':
            out.extend(seg_asr)  # fala fora do roteiro: mantém o que foi dito
        # 'insert' (palavra do roteiro que não foi dita): fica de fora da legenda
    words = out
    print(f'roteiro: {trocas} palavras com a grafia do roteiro em trechos divergentes')

for w in words:
    w['start'] = round(w['start'], 3); w['end'] = round(w['end'], 3)
json.dump(words, open(a.saida, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
print(f'audio {len(x)/16000:.1f}s | carga do modelo {t1-t0:.1f}s | transcricao {t2-t1:.1f}s | {len(words)} palavras')
print(r.text[:300])
