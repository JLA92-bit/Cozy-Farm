# Cozy Acres for Android (Trusted Web Activity)

The Android app is a **Trusted Web Activity (TWA)**: a small Android shell that opens the live game at
<https://cozyacres.joshmakesgames.app/play/> full screen in Chrome, without any browser bar. It is built with
Google's [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) by the manual GitHub Actions workflow
`.github/workflows/android.yml`. Game updates go live by deploying the website as usual; a new app bundle is only
needed when something in `twa-manifest.json` changes (name, icons, colours) or Google asks for a newer target SDK.

## Files in this folder

| File | What it is |
| --- | --- |
| `twa-manifest.json` | Bubblewrap's project file and the single source of truth for the app: package id `app.joshmakesgames.cozyacres`, host, start URL `/play/`, name, colours, icon URLs, display mode, version, signing key alias. The workflow generates the Android project from it on every build. |
| `assetlinks.template.json` | Template for the Digital Asset Links file that proves the website and the app belong together. Without it Android shows a browser bar at the top of the app. See below. |
| `README.md` | This file. |

Files Bubblewrap generates here (`app/`, `gradle/`, `build.gradle`, `gradlew`, `manifest-checksum.txt`, `*.aab`,
`*.apk`, `store_icon.png`...) and the keystore are listed in `.gitignore` and must never be committed.

Notes on `twa-manifest.json`:
- Colours come from the game's web manifest (`vite.config.ts`): theme `#7CC85A` (status/navigation bar),
  background `#8FD3F4` (splash screen). `display` is `fullscreen` like the game, `orientation` is `default`
  (the game's manifest says `any`, so phones and tablets can rotate).
- Icons are the game's own PWA icons, served by the game at `/play/icons/`: `icon-512.png` (launcher and
  splash), `icon-maskable-512.png` (adaptive icon) and `icon-monochrome-432.png` (copied from
  `design/cozy-acres-graphics/icons/android-adaptive/ic_launcher_monochrome-432.png`). Bubblewrap downloads them
  at build time, so the website must be live before building. The Play Store listing icon is uploaded
  separately (`design/cozy-acres-graphics/icons/google-play-icon-512.png`).
- Bubblewrap reads the version name from the field `appVersion`; `appVersionName` is written next to it and
  both are kept in step by the workflow. `appVersionCode` must go up by at least 1 for every bundle uploaded to Play.
- `webManifestUrl` is `https://cozyacres.joshmakesgames.app/play/manifest.webmanifest` (the file name
  vite-plugin-pwa writes). `fullScopeUrl` is `/play/`.
- `fallbackType` is `customtabs`: on a phone without a Chrome that supports TWAs, the game opens in a Custom Tab.
- Sign in with Google works inside the app: the Google page opens in the same Chrome window and comes back to
  `/play/` (see ONLINE.md, step 6).

## 1. Create the upload key (once, keep it forever)

Google Play uses **Play App Signing**: Google keeps the real app signing key, and you sign each upload with your
own **upload key**. Create it on your own computer (needs Java; `keytool` comes with any JDK, for example
Temurin 17 from <https://adoptium.net>):

```bash
keytool -genkeypair -v \
  -keystore upload-keystore.jks \
  -alias upload \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=Josh Makes Games, O=Josh Makes Games, C=GB"
```

(Change `C=GB` to your two-letter country code.) It asks for a keystore password and a key password; you can use
the same strong password for both (at least 6 characters). The alias must stay `upload`, as in `twa-manifest.json`.

Keep it safe:
- **Never commit it** to git (`.gitignore` already blocks `*.jks` and `*.keystore`), never email it, never put it in
  a shared folder.
- **Back it up** in two places, for example a password manager that stores files plus an encrypted USB stick, with
  both passwords. If the upload key is ever lost, Play support can reset it, but that takes days.

Show its SHA-256 fingerprint (you need it for assetlinks.json):

```bash
keytool -list -v -keystore upload-keystore.jks -alias upload
```

## 2. Add the GitHub secrets and variables

Repository > **Settings** > **Secrets and variables** > **Actions**.

**Secrets** (tab "Secrets", button "New repository secret"):

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | The keystore file, base64 encoded on one line. macOS: `base64 -i upload-keystore.jks \| pbcopy`. Linux: `base64 -w0 upload-keystore.jks`. Windows PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("upload-keystore.jks")) \| Set-Clipboard`. Paste the whole text. |
| `BUBBLEWRAP_KEYSTORE_PASSWORD` | The keystore password. Bubblewrap reads exactly this environment variable name. |
| `BUBBLEWRAP_KEY_PASSWORD` | The key password (the same as above if you used one password). Bubblewrap reads exactly this name. |
| `PLAY_SERVICE_ACCOUNT_JSON` | Optional. The JSON key of a Google Cloud service account that has access to the app in Play Console (Play Console > Users and permissions > invite the service account email, with "Release to testing tracks"). Only needed for automatic uploads to the internal testing track. |

**Variables** (tab "Variables"):

| Variable | Value |
| --- | --- |
| `ANDROID_CERT_SHA256` | The SHA-256 certificate fingerprint(s) the website publishes in `/.well-known/assetlinks.json`, comma separated, in the `AB:CD:...` form. Put the **app signing key** fingerprint from Play Console first and the **upload key** fingerprint second. The website deploy (`deploy.yml`) builds assetlinks.json from this variable. |

## 3. Digital Asset Links (assetlinks.json)

Android only hides the browser bar when `https://cozyacres.joshmakesgames.app/.well-known/assetlinks.json` lists
the SHA-256 fingerprint of the certificate that signed the installed app. `assetlinks.template.json` shows the
format; the deploy fills `sha256_cert_fingerprints` from the `ANDROID_CERT_SHA256` variable (several values allowed).

Which fingerprints:
1. **App signing key** (what players install from Play): Play Console > your app > **Setup** > **App signing**
   (on newer consoles: **Test and release > Setup > App integrity > App signing**) > "App signing key certificate" >
   **SHA-256 certificate fingerprint**. Available after the first bundle is uploaded.
2. **Upload key** (what the workflow's `app-release-signed.apk` is signed with, for testing on your own phone): the
   `keytool -list -v` output above, or the "Show upload key fingerprint" step of the workflow run, or Play Console's
   "Upload key certificate".

Example value of `ANDROID_CERT_SHA256`: `AA:BB:...:FF,11:22:...:99`. After changing it, re-run the website deploy and
check <https://cozyacres.joshmakesgames.app/.well-known/assetlinks.json>. Google's checker:
<https://developers.google.com/digital-asset-links/tools/generator>. If the browser bar still shows in the app,
the fingerprint does not match the installed app's certificate.

## 4. Build

Actions > **Build Android app (TWA)** > **Run workflow**:
- `versionCode`: a whole number higher than every bundle already uploaded (1 for the first upload, then 2, 3...).
- `versionName`: leave empty to use the version in `package.json` (1.3.0), or type one.
- `uploadToPlay`: tick to also send the bundle to the internal testing track as a draft (needs `PLAY_SERVICE_ACCOUNT_JSON`).

The workflow installs JDK 17, the Android SDK (build-tools 36.1.0 and android-36, what Bubblewrap 1.25.0 expects) and
Bubblewrap 1.25.0, writes `~/.bubblewrap/config.json`, writes the version into `twa-manifest.json`, decodes the
keystore, runs `bubblewrap update --skipVersionUpgrade` (generates the Android project from twa-manifest.json and
downloads the icons) and `bubblewrap build --skipPwaValidation`, then deletes the keystore. Download the
**cozy-acres-android-<versionCode>** artifact from the run: `app-release-bundle.aab` goes to Play,
`app-release-signed.apk` can be installed on your own phone for testing (`adb install app-release-signed.apk`).

The version change is not committed back to the repository: after a successful upload, update `appVersionCode`
(and `appVersion`/`appVersionName`) in `twa-manifest.json` yourself so the next run starts from the right number.

**The first upload to a new app must be done by hand** in Play Console (the Play API cannot create the first
release), so download the .aab and upload it in Play Console > Testing > Internal testing (or Closed testing) >
Create new release. Later builds can use `uploadToPlay`.

## Building on your own computer (optional)

```bash
npm install -g @bubblewrap/cli
cd android
cp /safe/place/upload-keystore.jks .
bubblewrap update --skipVersionUpgrade   # first time: Bubblewrap offers to download a JDK and the Android SDK
bubblewrap build
rm upload-keystore.jks
```
