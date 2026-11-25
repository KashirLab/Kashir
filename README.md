Kashir is a mobile Cashu wallet built with React Native and the Cashu Development Kit.

## Run on iOS

If you previously built Kashir with the Nostr SDK, run `yarn ubrn:clean` once before rebuilding the bindings.

Install Node.js 24.3 or later in the 24.x series (`nvm install` uses `.nvmrc`), Xcode, and CocoaPods. Run these commands from the repository root:

```sh
git submodule update --init --recursive
yarn install --immutable
yarn ubrn:ios
yarn example ios --simulator "iPhone 17e"
```

Use a simulator name from `xcrun simctl list devices available`. The binding build generates the CDK framework and installs the pods. Run it again after changing the Rust bindings. After changing native dependencies or the Podfile, run `(cd example/ios && pod install)`. Use `yarn example build:ios` to build without launching.

The app and CDK framework target iOS 15.1 or later. If you previously built with a different iOS minimum, run `CARGO_TARGET_DIR="$(mktemp -d)" yarn ubrn:ios` to avoid reusing old Cargo objects.

Open `example/ios/Kashir.xcworkspace` and select the `KashirApp` scheme to run from Xcode.

## Xcode Cloud

Open the workspace in Xcode, then go to **Report navigator → Cloud → Get Started**. Connect the repository and add an iOS Archive action for the shared `KashirApp` scheme. The post-clone script in `example/ios/ci_scripts` builds the CDK framework and installs CocoaPods dependencies before the archive.
