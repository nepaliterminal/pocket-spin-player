#!/bin/bash
# Tiny offline build using an existing Android SDK; no Gradle downloads.
set -euo pipefail
if [ "$#" -lt 3 ]; then
  echo 'Usage: bash android/build.sh SDK_ROOT JDK_ROOT OUTPUT_APK [SCRATCH_DIRECTORY]'
  exit 2
fi
sdk_root="$1"
jdk_root="$2"
output_apk="$3"
source_root="$(cd "$(dirname "$0")" && pwd)"
scratch_parent="${4:-$source_root/.build}"
build_tools="$sdk_root/build-tools/36.0.0"
android_jar="$sdk_root/platforms/android-37.0/android.jar"
for executable in "$jdk_root/bin/java" "$jdk_root/bin/javac" "$jdk_root/bin/keytool" "$build_tools/aapt2" "$build_tools/zipalign"; do
  test -x "$executable" || { echo "Missing executable: $executable"; exit 1; }
done
test -f "$android_jar" || { echo "Missing compile platform: $android_jar"; exit 1; }
case "$output_apk" in /*) ;; *) echo 'OUTPUT_APK must be an absolute path'; exit 2;; esac
mkdir -p "$scratch_parent" "$(dirname "$output_apk")"
build_dir="$(mktemp -d "$scratch_parent/pocket-spin.XXXXXX")"
mkdir -p "$build_dir/classes" "$build_dir/dex"
"$build_tools/aapt2" compile --dir "$source_root/res" -o "$build_dir/resources.zip"
"$build_tools/aapt2" link -o "$build_dir/unsigned.apk" --manifest "$source_root/AndroidManifest.xml" -I "$android_jar" "$build_dir/resources.zip"
"$jdk_root/bin/javac" --release 8 -classpath "$android_jar" -d "$build_dir/classes" "$source_root/src/io/github/nepaliterminal/pocketspin/MainActivity.java"
"$jdk_root/bin/jar" --create --file "$build_dir/classes.jar" -C "$build_dir/classes" .
"$jdk_root/bin/java" -cp "$build_tools/lib/d8.jar" com.android.tools.r8.D8 --release --min-api 24 --lib "$android_jar" --output "$build_dir/dex" "$build_dir/classes.jar"
(cd "$build_dir/dex" && zip -q -j "$build_dir/unsigned.apk" classes.dex)
"$build_tools/zipalign" -p -f 4 "$build_dir/unsigned.apk" "$build_dir/aligned.apk"
# Local test signing only. Keep this key for installable updates; never commit it.
signing_dir="$source_root/.local-signing"
mkdir -p "$signing_dir"
chmod 700 "$signing_dir"
key="$signing_dir/pocket-spin-debug.keystore"
if [ ! -f "$key" ]; then
  "$jdk_root/bin/keytool" -genkeypair -keystore "$key" -storepass android -keypass android -alias pocketspin -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Pocket Spin Development" -noprompt
  chmod 600 "$key"
fi
"$jdk_root/bin/java" -jar "$build_tools/lib/apksigner.jar" sign --ks "$key" --ks-key-alias pocketspin --ks-pass pass:android --key-pass pass:android --out "$output_apk" "$build_dir/aligned.apk"
"$jdk_root/bin/java" -jar "$build_tools/lib/apksigner.jar" verify --verbose "$output_apk"
"$build_tools/aapt2" dump badging "$output_apk"
shasum -a 256 "$output_apk"
echo "Build intermediates: $build_dir"
