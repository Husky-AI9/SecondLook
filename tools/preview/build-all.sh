#!/usr/bin/env bash
# Builds the four preview variants the browser tests use.
set -euo pipefail
cd "$(dirname "$0")/../.."
FONT_ARG=()
if [ -n "${PREVIEW_FONT:-}" ]; then FONT_ARG=(--font "$PREVIEW_FONT"); fi
node tools/preview/build.mjs "${FONT_ARG[@]}" --out dist-preview
node tools/preview/build.mjs "${FONT_ARG[@]}" --out dist-preview-off --firebase off
node tools/preview/build.mjs "${FONT_ARG[@]}" --out dist-preview-ios --os ios
node tools/preview/build.mjs "${FONT_ARG[@]}" --out dist-preview-android --os android
node tools/preview/build.mjs "${FONT_ARG[@]}" --out dist-preview-ios-kb --os ios --keyboard 1
