#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
TAG=${IMAGE_TAG:-$(git -C "$ROOT" rev-parse --short=12 HEAD)}
REGISTRY=ghcr.io/senarais

if [ ! -x "$ROOT/web/node_modules/.bin/tsx" ]; then
  npm --prefix "$ROOT/web" ci
fi
npm --prefix "$ROOT/web" run ai-briefings:build

publish() {
  name=$1
  context=$2
  docker buildx build \
    --platform linux/amd64 \
    --push \
    --tag "$REGISTRY/tingraph-$name:$TAG" \
    --tag "$REGISTRY/tingraph-$name:latest" \
    "$ROOT/$context"
}

publish backend backend
publish web web
publish backup ops/backup

printf 'Published images with IMAGE_TAG=%s\n' "$TAG"
