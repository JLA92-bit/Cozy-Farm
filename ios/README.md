# Cozy Acres for iPhone (Capacitor app)

The iPhone app is the same **Capacitor** setup as the Android app (`android/README.md`): the game's own files
(`npm run build:ios`, into `dist-app/`) are packed inside the app and run in its web view, offline from the first
start. It is built on the owner's Mac (Xcode only runs on macOS); the Android build stays on GitHub Actions.

- Bundle ID `app.joshmakesgames.cozyacres` (the same as the Android package), display name Cozy Acres.
- iPhone only for now (`TARGETED_DEVICE_FAMILY = 1`), portrait and landscape, iOS 15 or newer.
- Swift Package Manager, no CocoaPods: `cap sync ios` writes `App/CapApp-SPM/Package.swift`.
- **Game updates need a new app build** (and Apple's review, usually a day or two). Batch them, like Android.

## What is different from the website (src/core/Native.ts)

The same as the Android app (table in `android/README.md`), plus:

| | iPhone app |
| --- | --- |
| Files | served from `capacitor://localhost` (not `https://localhost`) |
| "Your save is from a newer version" | Update now opens the App Store page (`APP_STORE_URL`; until it is set, the screen says to update in TestFlight) |
| Platform in the dashboard | `ios` (the same as an iPhone Home Screen web app) |
| Phone notifications | not yet (APNs and a change to `send-push`, to do) |

## Files

- `App/App/Info.plist`: URL scheme `app.joshmakesgames.cozyacres` (the sign-in deep link
  `app.joshmakesgames.cozyacres://auth`), `ITSAppUsesNonExemptEncryption` false (HTTPS only, no export paperwork),
  status bar hidden, `arm64`.
- `App/App.xcodeproj/project.pbxproj`: `MARKETING_VERSION` (the game version, e.g. 1.32.0) and
  `CURRENT_PROJECT_VERSION` (the build number, goes up with every upload, like Android's versionCode).
- Icon and splash: `node scripts/ios-icons.mjs` (from `public/favicon.svg`, uses Google Chrome).
- `App/App/public`, `capacitor.config.json` and `config.xml` are made by `cap sync` and not committed.

## One-time setup on the Mac

1. Xcode from the Mac App Store, opened once (it adds the iOS platform and Simulator), then in Terminal:
   `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer` and `sudo xcodebuild -license accept`.
2. `npm ci`
3. Once the Apple Developer membership is active: Xcode > Settings > Accounts > add the Apple ID, then in the App
   target > Signing & Capabilities pick the team (Automatically manage signing).

## Sign in with Apple (App Store guideline 4.8)

Google sign-in is offered, so the iPhone app must offer Sign in with Apple too. The code is ready behind a switch:
`APPLE_SIGN_IN` in `src/core/Native.ts` (false until the steps below are done; the button only ever shows in the iPhone
app, next to Google). It uses the same browser and deep link flow as Google (`signInVia` in `SupabaseBackend.ts`).

Once the Apple Developer membership is active:

1. developer.apple.com > Certificates, Identifiers & Profiles > Identifiers: the App ID
   `app.joshmakesgames.cozyacres`, tick **Sign in with Apple**.
2. Identifiers > + > **Services IDs**: e.g. `app.joshmakesgames.cozyacres.signin`, tick Sign in with Apple, Configure:
   primary App ID as above, domain `<project>.supabase.co`, return URL
   `https://<project>.supabase.co/auth/v1/callback` (the same callback Google uses; Supabase > Authentication >
   Providers > Apple shows it).
3. Keys > + > tick Sign in with Apple, download the `.p8` key (once only; keep it safe, never commit it). Note the Key ID
   and the Team ID.
4. Supabase > Authentication > Providers > **Apple**: switch on, Client IDs = the Services ID, and the secret key made
   from the `.p8`, Key ID and Team ID (Supabase's Apple page links a generator). **The secret expires after 6 months**:
   put a reminder in the calendar to make a new one.
5. Set `APPLE_SIGN_IN = true`, `npm run build:ios`, try it in the Simulator or on the iPhone.

Account deletion: Apple asks apps with Sign in with Apple to revoke the Apple token when a player deletes their
account (guideline 5.1.1(v)). Settings > Delete my online account deletes everything on our side; revoking at Apple
needs a small server function with the same key (to do before the App Store submission).

## Build and try it

```bash
npm run build:ios          # the game into dist-app, then copied into ios/
npx cap open ios           # opens Xcode: pick an iPhone Simulator and press Run
```

Or from Terminal: `npx cap run ios --target <simulator id>` (`xcrun simctl list devices` lists them).

## Upload to TestFlight

1. Raise `CURRENT_PROJECT_VERSION` (and `MARKETING_VERSION` to the game version) in Xcode > App target > General.
2. `npm run build:ios`
3. Xcode: device "Any iOS Device (arm64)", Product > Archive, then Distribute App > App Store Connect > Upload.
4. App Store Connect > the app > TestFlight: the build appears after processing (10-30 minutes); add testers.
