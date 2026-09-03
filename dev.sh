#!/usr/bin/env sh
# DocuLight 2.0 개발 기동 — API(Express)와 web(Vite)을 함께 띄운다.
#
# 이 파일이 하는 일은 하나다: 어디서 부르든 저장소 루트를 찾아
# `scripts/dev.mjs` 에 넘긴다. 로직을 여기에도 적으면 `dev.bat` 과 갈리고,
# 갈린 뒤에는 한쪽만 고쳐진다.
#
#   ./dev.sh
#
# 멈추려면 Ctrl+C 를 누른다 — 두 프로세스와 그 자식까지 함께 정리된다.
set -eu

ROOT=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
exec node "$ROOT/scripts/dev.mjs" "$@"
