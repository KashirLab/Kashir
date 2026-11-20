Kashir is a mobile ecash(Cashu) wallet built with react native, rust-nostr SDK and Cashu Development Kit

## Run on iOS

Install Node.js 24.3 or later in the 24.x series (`nvm install` uses `.nvmrc`), Xcode, and CocoaPods. Run these commands from the repository root:

```sh
git submodule update --init --recursive
yarn install --immutable
yarn ubrn:ios
yarn example ios --simulator "iPhone 17e"
```

Use a simulator name from `xcrun simctl list devices available`. The binding build generates both Rust frameworks and installs the pods. Run it again after changing the Rust bindings. After changing native dependencies or the Podfile, run `(cd example/ios && pod install)`. Use `yarn example build:ios` to build without launching.

The app and both Rust frameworks target iOS 15.1 or later. If you previously built with a different iOS minimum, run `CARGO_TARGET_DIR="$(mktemp -d)" yarn ubrn:ios` to avoid reusing old Cargo objects.

Open `example/ios/Kashir.xcworkspace` and select the `KashirApp` scheme to run from Xcode.
