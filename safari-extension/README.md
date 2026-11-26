# Kashir Safari extension

Set the ad site in a `.env` file at the repository root before starting Metro or building Kashir.

```dotenv
WATCH_ADS_URL=https://your-ad-site.example
```

Use an HTTPS origin. Restart Metro and rebuild the iOS app after changing it. An unset value hides the Watch Ads tab and gives the Safari extension no site to run on. For CI builds, set `WATCH_ADS_URL` as an Xcode Cloud environment variable or a GitHub Actions repository variable.

The Kashir wallet app bundles the Safari extension on iOS. Install the wallet app on your connected iPhone from the `example` directory.

```sh
yarn ios --device
```

To configure signing, open `example/ios/Kashir.xcworkspace` and select **Kashir Extension**. The extension uses the App ID `com.kashir.ios.SafariExtension` and shares the `group.kashir` App Group with the Kashir app. Both targets must use the same Apple development team.

Open Kashir to set up or migrate your wallet and choose an active mint. Then go to **Settings → Apps → Safari → Extensions**, enable **Kashir**, and grant it access to the ad site. After you tap **受け取り**, the extension selects LNURL and redeems the reward into the shared wallet. Kashir refreshes the balance when you return to it.

If you installed the previous standalone Safari companion, remove it after installing the updated wallet app.
