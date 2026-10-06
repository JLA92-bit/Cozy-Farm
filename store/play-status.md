# Google Play status - Cozy Acres

Last updated 6 October 2026. Keep this file current; it is the quick answer to "where are we with Play?".

## Where things stand
- The Android app (Trusted Web Activity, Bubblewrap 1.25.0) is uploaded to Play Console and installs through
  internal testing.
- App content forms, store listing and graphics are done. The closed testing release uses versionCode 4
  (version name 1.6.0) and has been sent for review (usually a few days, up to about 7). Until it is approved, testers
  see the temporary name `app.joshmakesgames.cozyacres (unreviewed)` and a plain icon. That is expected.
- Next: once approved, invite 15-20 testers aged 13+ (`store/testing.md`). Google needs 12+ testers opted in for 14
  days in a row before you can apply for production (`store/test-log.md` has the draft answers).

## Key facts
| Item | Value |
| --- | --- |
| Package name (permanent) | `app.joshmakesgames.cozyacres` |
| Wraps | https://cozyacres.joshmakesgames.app/play/ |
| Latest versionCode uploaded | 4 (1.6.0). The next bundle must use 5 or higher. |
| minSdkVersion | 24 (needed for Play's automatic protection) |
| Signing fingerprints | In the GitHub variable `ANDROID_CERT_SHA256`: Play app signing key first, upload key second |
| Website hosting | GitHub Pages (the Cloudflare move is parked until after launch, see CLOUDFLARE.md) |

## GitHub settings
- Secrets: `ANDROID_KEYSTORE_BASE64`, `BUBBLEWRAP_KEYSTORE_PASSWORD`, `BUBBLEWRAP_KEY_PASSWORD`.
- Variables: `ANDROID_PACKAGE` = `app.joshmakesgames.cozyacres`; `ANDROID_CERT_SHA256` = app signing key, upload key.
- The Cloudflare secrets were removed, so deploys go to GitHub Pages. Add them back only when resuming the move.
- The upload keystore (made with `android/make-upload-key.html`) is backed up outside GitHub and must never be
  committed.

## Lessons from the first upload
1. `assetlinks.json` is only written when both Android variables are set and the deploy succeeds.
2. Builds run from `main`: Android settings changed on another branch do nothing until merged into `main`.
3. Check a bundle before uploading (version code, minSdk) so an old build is not uploaded by mistake.
4. A Play app's package name is fixed forever once created.
5. Play re-signs the app with Google's key, so Google's app signing fingerprint must be in `ANDROID_CERT_SHA256`, or
   the browser bar appears. Android caches the check: testers may need to reinstall after a fix.
6. A version code can only be uploaded once; reuse a bundle with "Add from library".

## Ongoing rules
- Game updates go live by pushing to `main`. No new bundle is needed.
- A new bundle is only needed when the app name, icon, colours or notification settings change, or Google raises the
  target SDK. Each upload needs a higher versionCode (run "Build Android app (TWA)" with the new number).
- Never set `ANDROID_CERT_SHA256` to wrong values, or the browser bar comes back for every player.

## To-do
- [ ] Review approved: send testers the opt-in link (invite text in `store/testing.md`).
- [ ] Log feedback in `store/test-log.md` during the 14 days.
- [x] `appVersionCode` 4 / version 1.6.0 recorded in `android/twa-manifest.json`.
- [ ] Change the GitHub default branch to `main` (Settings > General > Default branch).
- [ ] Delete the old draft Play app locked to `com.cozyacres.joshmakesgames`.
- [x] Android workflow actions updated (checkout, setup-node, setup-java v5) to clear the Node 20 warnings.
- [ ] After 14 days: apply for production, add the official Google Play badge to the website, decide on Cloudflare
      (keep `ANDROID_CERT_SHA256` set either way).
