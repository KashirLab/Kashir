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

app_name='Kashir'
bundle_id=com.kashir.safari
build_dir=$(mktemp -d)
trap 'rm -rf "$build_dir"' EXIT

xcrun safari-web-extension-converter "$repo_dir/safari-extension" \
  --project-location "$build_dir" --app-name "$app_name" \
  --bundle-identifier "$bundle_id" --swift --ios-only --no-open --no-prompt

shopt -s nullglob
project_files=(
  "$build_dir"/*/*.xcodeproj/project.xcproj "$build_dir"/*.xcodeproj/project.xcproj
  "$build_dir"/*/*.xcodeproj/project.pbxproj "$build_dir"/*.xcodeproj/project.pbxproj
)
if [[ ${#project_files[@]} -ne 1 || ! -s "${project_files[0]}" ]]; then
  printf 'Safari converter did not produce one readable Xcode project.\n' >&2
  exit 1
fi
project_file=${project_files[0]}
project=${project_file%/*}

# The converter can assign the host a different ID from the extension's prefix.
if [[ "$project_file" == */project.xcproj ]]; then
  node -e '
    const fs = require("node:fs");
    const [file, bundleId] = process.argv.slice(1);
    const source = fs.readFileSync(file, "utf8");
    const hostId = /("PRODUCT_BUNDLE_IDENTIFIER"\s*:\s*")com\.kashir\.Kashir(?=")/g;
    fs.writeFileSync(file, source.replace(hostId, (_, prefix) => prefix + bundleId));
  ' "$project_file" "$bundle_id"
else
  project_json=$(plutil -convert json -o - "$project_file")
  node -e '
    const fs = require("node:fs");
    const [file, bundleId] = process.argv.slice(1);
    const { objects } = JSON.parse(fs.readFileSync(0, "utf8"));
    const app = Object.values(objects).find(target =>
      target.isa === "PBXNativeTarget" &&
      target.productType === "com.apple.product-type.application"
    );
    if (!app) throw new Error("Could not find the generated iOS host target");
  
    let source = fs.readFileSync(file, "utf8");
    for (const id of objects[app.buildConfigurationList].buildConfigurations) {
      const configuration = new RegExp(
        "(^\\s*" + id + " [^\\n]*\\{(?:(?!^\\t\\t\\};)[\\s\\S])*?PRODUCT_BUNDLE_IDENTIFIER\\s*=\\s*)[^;]+;",
        "m"
      );
      if (!configuration.test(source)) {
        throw new Error("Could not find the host bundle identifier in configuration " + id);
      }
      source = source.replace(configuration, (_, prefix) => prefix + bundleId + ";");
    }
    fs.writeFileSync(file, source);
  ' "$project_file" "$bundle_id" <<< "$project_json"
fi

schemes_json=$(xcodebuild -project "$project" -list -json)
scheme=$(node -e '
  const fs = require("node:fs");
  const appName = process.argv[1];
  const { schemes = [] } = JSON.parse(fs.readFileSync(0, "utf8")).project;
  const scheme = schemes.find(name => name === appName || name === appName + " (iOS)");
  if (!scheme) throw new Error("Could not find the iOS app scheme: " + schemes.join(", "));
  process.stdout.write(scheme);
' "$app_name" <<< "$schemes_json")

xcodebuild -project "$project" -scheme "$scheme" -configuration Debug \
  -destination "platform=iOS,id=$device_udid" -derivedDataPath "$build_dir/DerivedData" \
  -allowProvisioningUpdates -allowProvisioningDeviceRegistration \
  "DEVELOPMENT_TEAM=$development_team" CODE_SIGN_STYLE=Automatic build

apps=("$build_dir"/DerivedData/Build/Products/Debug-iphoneos/*.app)
if [[ ${#apps[@]} -ne 1 ]]; then
  printf 'Expected one built iOS host app.\n' >&2
  exit 1
fi

xcrun devicectl device install app --device "$device_udid" "${apps[0]}"
xcrun devicectl device process launch --device "$device_udid" "$bundle_id"
