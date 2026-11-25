# Kashir

Use an iPhone with Developer Mode enabled and a development team configured in Xcode. With one iPhone connected, run:

```sh
yarn safari:device
```

The command uses the signing team from Kashir’s Xcode project. To override it, run `yarn safari:device <development-team-id>`.

If several iPhones are available, use `yarn safari:device <device-udid> <development-team-id>`.

The command builds and signs the Safari host app, then installs and launches it on the phone. To edit signing in Xcode, open `safari-extension/ios/Kashir.xcodeproj` and select the **Kashir Extension** target. Enable **Kashir** under **Settings → Apps → Safari → Extensions**, then grant it access to the ad site in Safari.

Build the wallet app with the same Apple development team and give both the wallet app and Safari extension access to the `group.kashir` App Group. Open the updated wallet app once to migrate an existing wallet and publish its active mint.

After you tap **受け取り**, the extension selects the LNURL tab and redeems the reward into the shared wallet. Kashir refreshes the balance when you return to the app.
