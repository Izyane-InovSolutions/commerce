#!/usr/bin/env bash
# Renders the brand images and installs them as the iOS and Android app
# icons and launch screens. Run from apps/mobile after changing the mark,
# the wordmark or the palette:
#
#   tool/brand_assets.sh
#
# macOS only (uses sips).
set -euo pipefail
cd "$(dirname "$0")/.."

flutter test tool/render_brand_test.dart >/dev/null
B=build/brand

# sips keeps the alpha channel; App Store icons must not have one, so the
# square icon goes through JPEG (which has none) on its way back to PNG.
opaque() { # src size dst
  sips -z "$2" "$2" "$1" -s format jpeg -s formatOptions 100 --out "$B/tmp.jpg" >/dev/null
  sips -s format png "$B/tmp.jpg" --out "$3" >/dev/null
}
fit() { # src width height dst
  sips -z "$3" "$2" "$1" --out "$4" >/dev/null
}


# ---- iOS app icon
ICONS=ios/Runner/Assets.xcassets/AppIcon.appiconset
for spec in 20:1 20:2 20:3 29:1 29:2 29:3 40:1 40:2 40:3 60:2 60:3 76:1 76:2 83.5:2 1024:1; do
  pt=${spec%%:*}; x=${spec##*:}
  px=$(python3 -c "print(round($pt*$x))")
  opaque "$B/icon.png" "$px" "$ICONS/Icon-App-${pt}x${pt}@${x}x.png"
done

# ---- iOS launch image (light and dark). Rendered on the page colour: a
# transparent image does not draw on an iOS launch screen.
LAUNCH=ios/Runner/Assets.xcassets/SplashWordmark.imageset
for x in 1 2 3; do
  suffix=$([ "$x" = 1 ] && echo "" || echo "@${x}x")
  fit "$B/splash_light.png" $((360 * x)) $((120 * x)) "$LAUNCH/LaunchImage$suffix.png"
  fit "$B/splash_dark.png" $((360 * x)) $((120 * x)) "$LAUNCH/LaunchImageDark$suffix.png"
done

# ---- Android launcher icon: made in Android Studio (Image Asset, as .webp,
# with round and monochrome variants), so not written here. To redo it, use
# build/brand/adaptive_foreground.png as the foreground and #415F91 behind.
RES=android/app/src/main/res

# ---- Android launch image (API < 31; 31+ shows the icon, then Flutter's)
for spec in mdpi:1 hdpi:1.5 xhdpi:2 xxhdpi:3 xxxhdpi:4; do
  IFS=: read -r d x <<<"$spec"
  w=$(python3 -c "print(round(360*$x))"); h=$(python3 -c "print(round(120*$x))")
  mkdir -p "$RES/drawable-$d" "$RES/drawable-night-$d"
  fit "$B/splash_light.png" "$w" "$h" "$RES/drawable-$d/splash_wordmark.png"
  fit "$B/splash_dark.png" "$w" "$h" "$RES/drawable-night-$d/splash_wordmark.png"
done

rm -f "$B/tmp.jpg"
echo "Brand assets installed."
