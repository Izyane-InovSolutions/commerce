#!/usr/bin/env bash
# Builds Good for Goods and sends it to internal testers with Firebase App
# Distribution. One-time setup is in DISTRIBUTION.md.
#
#   API_BASE_URL=https://<tunnel>.trycloudflare.com/api/v1 tool/distribute.sh android
#   API_BASE_URL=... tool/distribute.sh ios
#   API_BASE_URL=... tool/distribute.sh all
#
# Reads the Firebase app ids and tester groups from tool/distribution.env.
set -euo pipefail
cd "$(dirname "$0")/.."

target=${1:-all}
[ -f tool/distribution.env ] || {
  echo "Missing tool/distribution.env — copy tool/distribution.env.example and fill it in." >&2
  exit 1
}
# shellcheck disable=SC1091
source tool/distribution.env
: "${API_BASE_URL:?Set API_BASE_URL to the API testers should use, ending in /api/v1}"
: "${FIREBASE_GROUPS:=internal-testers}"
command -v firebase >/dev/null || {
  echo "Install the Firebase CLI first: npm install -g firebase-tools, then firebase login" >&2
  exit 1
}

# The build points at API_BASE_URL out of the box. A tester can still repoint
# it under Account → Server, but a build aimed at a dead address is a bad start.
if ! curl -fsS -m 15 "$API_BASE_URL/catalog/categories" >/dev/null; then
  echo "The API at $API_BASE_URL is not answering. Distribute anyway? [y/N]" >&2
  read -r answer
  [ "$answer" = y ] || exit 1
fi

# Every build a tester installs needs a higher build number than the last.
# The commit count only goes up, and ties a build back to its commit.
build=$(git rev-list --count HEAD)
commit=$(git rev-parse --short HEAD)
dirty=$([ -n "$(git status --porcelain)" ] && echo "+local changes" || echo "")
notes=$(printf 'Build %s (%s%s), API %s\n\n%s' "$build" "$commit" "$dirty" \
  "$API_BASE_URL" "$(git log -8 --pretty='- %s' -- .)")
defines=(
  "--dart-define=COMMERCE_API_BASE_URL=$API_BASE_URL"
  "--dart-define=APP_BUILD=$build ($commit)"
)

if [ "$target" = android ] || [ "$target" = all ]; then
  : "${FIREBASE_ANDROID_APP_ID:?Set FIREBASE_ANDROID_APP_ID in tool/distribution.env}"
  [ -f android/key.properties ] || echo "Warning: no android/key.properties — signing with this machine's debug key." >&2
  flutter build apk --release --build-number="$build" "${defines[@]}"
  firebase appdistribution:distribute build/app/outputs/flutter-apk/app-release.apk \
    --app "$FIREBASE_ANDROID_APP_ID" --groups "$FIREBASE_GROUPS" --release-notes "$notes"
fi

if [ "$target" = ios ] || [ "$target" = all ]; then
  : "${FIREBASE_IOS_APP_ID:?Set FIREBASE_IOS_APP_ID in tool/distribution.env}"
  # Ad hoc: only devices registered in the Apple Developer account can
  # install it. See DISTRIBUTION.md for adding a tester's device.
  flutter build ipa --release --build-number="$build" "${defines[@]}" \
    --export-options-plist=ios/ExportOptions-AdHoc.plist
  firebase appdistribution:distribute build/ios/ipa/*.ipa \
    --app "$FIREBASE_IOS_APP_ID" --groups "$FIREBASE_GROUPS" --release-notes "$notes"
fi

echo "Build $build sent to: $FIREBASE_GROUPS"
