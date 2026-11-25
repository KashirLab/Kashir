# Kashir

Use an iPhone with Developer Mode enabled and a development team configured in Xcode. With one iPhone connected, run:

```sh
yarn safari:device
```

The command uses the signing team from Kashir’s Xcode project. To override it, run `yarn safari:device <development-team-id>`.

If several iPhones are available, use `yarn safari:device <device-udid> <development-team-id>`.

The command generates an iOS project, builds and signs the Debug app, and installs and launches it on the phone. Enable **Kashir** under **Settings → Apps → Safari → Extensions**, then grant it access to the ad site in Safari.
