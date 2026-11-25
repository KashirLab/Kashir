#!/usr/bin/env bash
set -euo pipefail

repo_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

case $# in
  0)
    device_udid=''
    development_team=$(awk '/^[[:space:]]*DEVELOPMENT_TEAM = [A-Z0-9]+;/ {
      sub(/;$/, "", $3)
      print $3
    }' "$repo_dir/example/ios/Kashir.xcodeproj/project.pbxproj" | sort -u)
    if [[ ! "$development_team" =~ ^[A-Z0-9]{10}$ ]]; then
      printf 'Could not determine a unique signing team from Kashir. Pass a development team ID.\n' >&2
      exit 2
    fi
    ;;
  1)
    development_team=$1
    device_udid=''
    ;;
  2)
    device_udid=$1
    development_team=$2
    ;;
  *)
    printf 'Usage: yarn safari:device [[device-udid] development-team-id]\n' >&2
    exit 2
    ;;
esac

if [[ -z "$development_team" ]]; then
  printf 'A development team ID is required.\n' >&2
  exit 2
fi

if [[ -z "$device_udid" ]]; then
  device_udid=$(xcrun xcdevice list --timeout 5 | node -e '
    const fs = require("node:fs");
    const devices = JSON.parse(fs.readFileSync(0, "utf8"));
    const iphones = devices.filter(device =>
      device.available === true && device.simulator === false &&
      device.platform === "com.apple.platform.iphoneos" &&
      device.modelCode?.startsWith("iPhone") && device.identifier
    );
    if (iphones.length !== 1) {
      console.error(iphones.length === 0
        ? "No available iPhone found. Connect and unlock an iPhone, or specify its UDID."
        : "Multiple iPhones found. Specify a UDID:");
      for (const { name, identifier } of iphones) console.error(`  ${name} (${identifier})`);
      process.exit(1);
    }
    process.stdout.write(iphones[0].identifier);
  ')
  printf 'Using iPhone %s\n' "$device_udid"
fi

project="$repo_dir/safari-extension/ios/Kashir.xcodeproj"
bundle_id=com.kashir.safari
build_dir=$(mktemp -d)
trap 'rm -rf "$build_dir"' EXIT

xcodebuild -project "$project" -scheme Kashir -configuration Debug \
  -destination "platform=iOS,id=$device_udid" -derivedDataPath "$build_dir/DerivedData" \
  -allowProvisioningUpdates -allowProvisioningDeviceRegistration \
  "DEVELOPMENT_TEAM=$development_team" CODE_SIGN_STYLE=Automatic build

app="$build_dir/DerivedData/Build/Products/Debug-iphoneos/Kashir.app"
xcrun devicectl device install app --device "$device_udid" "$app"
xcrun devicectl device process launch --device "$device_udid" "$bundle_id"
