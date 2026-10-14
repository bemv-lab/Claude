"""TTS offline de TESTE com eSpeak NG (lib empacotada no wheel espeakng-loader do PyPI).
Gera WAV mono 16-bit + JSON com timings de palavras e fonemas (eventos nativos do eSpeak).
Uso: python -I tts_espeak.py <saida.wav> <saida.json> "<texto>" [voz] [rate] [pitch]
"""
import ctypes, json, sys, wave, struct
import espeakng_loader

out_wav, out_json, text = sys.argv[1], sys.argv[2], sys.argv[3]
voice = sys.argv[4] if len(sys.argv) > 4 else "pt-br"
rate = int(sys.argv[5]) if len(sys.argv) > 5 else 175
pitch = int(sys.argv[6]) if len(sys.argv) > 6 else 60

lib = ctypes.CDLL(espeakng_loader.get_library_path())
data_path = espeakng_loader.get_data_path()


class EventId(ctypes.Union):
    _fields_ = [("number", ctypes.c_int), ("name", ctypes.c_char_p), ("string", ctypes.c_char * 8)]


class Event(ctypes.Structure):
    _fields_ = [
        ("type", ctypes.c_int),
        ("unique_identifier", ctypes.c_uint),
        ("text_position", ctypes.c_int),
        ("length", ctypes.c_int),
        ("audio_position", ctypes.c_int),
        ("sample", ctypes.c_int),
        ("user_data", ctypes.c_void_p),
        ("id", EventId),
    ]


CALLBACK = ctypes.CFUNCTYPE(ctypes.c_int, ctypes.POINTER(ctypes.c_short), ctypes.c_int, ctypes.POINTER(Event))
AUDIO_OUTPUT_SYNCHRONOUS = 2
PHONEME_EVENTS = 0x0001
sr = lib.espeak_Initialize(AUDIO_OUTPUT_SYNCHRONOUS, 0, data_path.encode(), PHONEME_EVENTS)
if sr <= 0:
    raise SystemExit("espeak_Initialize falhou")

samples: list[int] = []
words: list[dict] = []
phonemes: list[dict] = []
text_bytes = text.encode("utf-8")


@CALLBACK
def on_synth(wav, n, events):
    if wav and n > 0:
        samples.extend(wav[:n])
    i = 0
    while True:
        ev = events[i]
        if ev.type == 0:  # LIST_TERMINATED
            break
        if ev.type == 1:  # WORD
            # text_position é 1-based em caracteres
            start = ev.text_position - 1
            words.append({"ms": ev.audio_position, "word": text[start:start + ev.length]})
        elif ev.type == 7:  # PHONEME
            phonemes.append({"ms": ev.audio_position, "ph": ev.id.string.decode("utf-8", "replace")})
        i += 1
    return 0


lib.espeak_SetSynthCallback(on_synth)
if lib.espeak_SetVoiceByName(voice.encode()) != 0:
    raise SystemExit(f"voz {voice} indisponível")
lib.espeak_SetParameter(1, rate, 0)   # espeakRATE (palavras/min)
lib.espeak_SetParameter(3, pitch, 0)  # espeakPITCH (0-100)
lib.espeak_SetParameter(4, 70, 0)     # espeakRANGE (entonação)
CHARS_UTF8, ENDPAUSE = 1, 0x1000
err = lib.espeak_Synth(text_bytes, len(text_bytes) + 1, 0, 1, 0, CHARS_UTF8 | ENDPAUSE, None, None)
lib.espeak_Synchronize()
lib.espeak_Terminate()
if err != 0:
    raise SystemExit(f"espeak_Synth erro {err}")

with wave.open(out_wav, "wb") as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(sr)
    w.writeframes(struct.pack(f"<{len(samples)}h", *samples))

with open(out_json, "w", encoding="utf-8") as f:
    json.dump({"sampleRate": sr, "durationMs": round(len(samples) * 1000 / sr), "words": words, "phonemes": phonemes}, f, ensure_ascii=False, indent=1)
print(f"ok sr={sr} dur={len(samples)/sr:.2f}s palavras={len(words)} fonemas={len(phonemes)}")
