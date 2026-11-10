#!/usr/bin/env bash
set -euo pipefail
mkdir -p diagnostics
adb install "$1"
adb logcat -c
adb shell am start -W -n kz.idealfloor.crm/.MainActivity || true
sleep 25
adb logcat -d -v brief AndroidRuntime:E ReactNativeJS:V ReactNative:V '*:S' | tee diagnostics/startup.log
adb shell uiautomator dump /sdcard/window.xml || true
adb pull /sdcard/window.xml diagnostics/startup-ui.xml || true
adb exec-out screencap -p > diagnostics/startup.png
adb shell pidof kz.idealfloor.crm
grep -Eq 'Вход|Логин' diagnostics/startup-ui.xml
if grep -Eq 'FATAL EXCEPTION|E/ReactNativeJS' diagnostics/startup.log; then
  echo 'Application startup failed; see empty-device diagnostics.'
  exit 1
fi
echo 'Android 13 startup passed: login screen is visible and app remains running.'
