# Cozy Acres for Android (Capacitor app, from 1.32)

The Android app is a **Capacitor** app: the game's own files (`npm run build:app`, into `dist-app/`) are packed
inside the app and run in the app's own web view, offline from the first start. It replaced the Trusted Web Activity
(TWA) in October 2026, because some testers will not test TWA apps (they open the website through Chrome). The old
TWA files are in `android-twa/` for reference only.

- Package name `app.joshmakesgames.cozyacres`, the same Play listing, the same upload key and secrets as the TWA:
  for Play it is simply the next version of the same app (versionCode 5 and up).
- **Game updates now need a new app build** (and Play's review, usually hours to a day or two) to reach app
  players. The website (`/play/`) still updates on every push to `main`, as before.

## What is different inside the app (src/core/Native.ts)

| | Website | App |
| --- | --- | --- |
| Files | served from `/play/`, cached by the service worker | inside the app, served from `https://localhost/`, no service worker |
| Sign in with Google | the page goes to Google and back | Google opens in the system browser, then the link `app.joshmakesgames.cozyacres://auth` brings the player back (`completeRedirect` in `SupabaseBackend.ts`) |
| Gift links | this page's address | always `https://cozyacres.joshmakesgames.app/play/?gift=...` |
| Phone notifications | web push | **not yet**: Settings says they are coming to the app. Needs Firebase Cloud Messaging and a matching change to `send-push` (to do) |
| "Your save is from a newer version" | Update now reloads | Update now opens the Play Store page |
| Safe areas (notch, rounded corners) | `env(safe-area-inset-*)` | Capacitor's `--safe-area-inset-*` (system bars hidden, `capacitor.config.ts`) |

## One-time setup (owner)

1. **Supabase > Authentication > URL Configuration > Redirect URLs:** add `app.joshmakesgames.cozyacres://auth`
   (without it, Google sign-in in the app comes back with an error).
2. GitHub secrets, unchanged from the TWA: `ANDROID_KEYSTORE_BASE64`, `BUBBLEWRAP_KEYSTORE_PASSWORD`,
   `BUBBLEWRAP_KEY_PASSWORD` (the upload key; `make-upload-key.html` makes one if it is ever lost and reset with
   Google). Optional `PLAY_SERVICE_ACCOUNT_JSON` to upload drafts to internal testing.

## Build and upload

1. GitHub > **Actions > Build Android app > Run workflow**. versionCode: higher than every bundle uploaded so far
   (the TWA reached 4, so the first app build is **5**). versionName: empty uses `package.json`.
2. Download the artifact `cozy-acres-android-<versionCode>` (it holds the `.aab` and an `.apk` to try on a phone).
3. Play Console > the testing track > Create new release > upload `cozy-acres-<versionCode>.aab`.

## Building on your own computer (optional)

Needs Node 22, Java 21 and the Android SDK (platform 36, build-tools 36):

```bash
npm ci
npm run build:app                       # the game into dist-app, then copied into android/
cd android && ./gradlew assembleDebug -PversionCode=5 -PversionName=1.32.0
# app/build/outputs/apk/debug/app-debug.apk, install with: adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Icons and splash screens come from `public/icons` (`python3 scripts/app-icons.py`, needs Pillow). Plugins: App
(deep links, and `getLaunchUrl` when Google's link starts the app afresh), Browser (Google sign-in) and Preferences
(sign-in steps kept safe if Android closes the app meanwhile), and App Update (`@capawesome/capacitor-app-update`,
1.33.3: "Update ready" from Google Play, `src/ui/UpdatePrompt.ts`); after adding another, run `npm run build:app` so `cap sync` wires it in.
