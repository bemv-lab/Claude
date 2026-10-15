#!/usr/bin/env bash
# Setup script do ambiente da Rocco (colar em: menu do ambiente > Edit > Setup script).
# Roda em toda sessão nova, antes do Claude começar. Só usa hosts já acessíveis (PyPI, npm, releases do GitHub).
set -euo pipefail

# Transcrição local pt-BR (Parakeet-TDT 0.6B v3 via sherpa-onnx): ~5 s por minuto de áudio em CPU
pip install --quiet sherpa-onnx==1.13.8 soundfile numpy
if [ ! -f /opt/asr/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/encoder.int8.onnx ]; then
  mkdir -p /opt/asr
  curl -sSL -o /tmp/parakeet.tar.bz2 \
    https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2
  tar -xjf /tmp/parakeet.tar.bz2 -C /opt/asr
  rm -f /tmp/parakeet.tar.bz2
fi

# Dependências do projeto de vídeo
if [ -d "$HOME/Claude/rocco-video" ]; then
  (cd "$HOME/Claude/rocco-video" && npm ci --silent)
elif [ -d /home/user/Claude/rocco-video ]; then
  (cd /home/user/Claude/rocco-video && npm ci --silent)
fi
