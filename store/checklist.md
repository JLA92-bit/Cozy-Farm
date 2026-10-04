# Google Play launch checklist - Cozy Acres

In order. Tick each box as you go. Details for the Android build are in `android/README.md`, the listing text in
`store/listing.md`, the Data safety answers in `store/data-safety.md`.

## 0. Before Play Console (can be done now)

- [ ] Website and game live: `https://cozyacres.joshmakesgames.app/` (privacy, support, delete-my-data pages) and
      the game at `https://cozyacres.joshmakesgames.app/play/` with real online play (Supabase variables set, ONLINE.md).
- [ ] Google sign-in set up for the new address (ONLINE.md step 6: OAuth origin `https://cozyacres.joshmakesgames.app`,
      Supabase Site URL and Redirect URL `https://cozyacres.joshmakesgames.app/play/`). OAuth consent screen published,
      with the privacy policy link.
- [ ] Rebuild the website (`python3 design/cozy-acres-website/build.py`) after merging, so public/ has the new
      screenshots, privacy, support and delete-my-data pages. Check `/privacy/` has no `[bracketed]` text left.
- [ ] Official Google Play badge: **not done yet**. The download from
      `https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png` was blocked from the
      build machine, so `design/cozy-acres-website/src/assets/img/google-play-badge.png` is still the placeholder.
      Download it from <https://play.google.com/intl/en_us/badges/> (English, PNG), save it over that file and rebuild
      the site. Use it only with the real Play link once the app is live (Google's badge guidelines).
- [ ] Create the upload keystore and back it up twice (android/README.md step 1).
- [ ] Add the GitHub secrets `ANDROID_KEYSTORE_BASE64`, `BUBBLEWRAP_KEYSTORE_PASSWORD`, `BUBBLEWRAP_KEY_PASSWORD`
      (android/README.md step 2).
- [ ] Run **Build Android app (TWA)** with versionCode 1 and download the artifact. Install `app-release-signed.apk`
      on your phone to try it (it shows a browser bar until assetlinks.json has the upload key fingerprint).
- [ ] Set the repository variable `ANDROID_CERT_SHA256` to the upload key fingerprint for now, redeploy the website,
      and check the bar disappears in the test APK.

## 1. Developer account

- [ ] Play Console developer account approved (personal account, name "Josh Makes Games" as developer name,
      contact email `joshmakesgames92@gmail.com`, identity verification done, 25 USD fee paid).
- [ ] Verify the contact phone and email Play asks for. Optionally add the website `https://joshmakesgames.app`.

## 2. Create the app

- [ ] Play Console > **Create app**: name "Cozy Acres", default language English (United States), **Game**, **Free**,
      accept the declarations. (The app itself stays Free to download. Optional gem purchases can be added later as in-app products with Google Play Billing; you then answer "Yes" to in-app purchases and update the listing, Data safety and privacy policy.)
- [ ] **Setup > App signing**: keep **Play App Signing** on (default). It activates with the first upload.

## 3. App content (Policy > App content) - all must be green before review

- [ ] **Privacy policy**: `https://cozyacres.joshmakesgames.app/privacy/`
- [ ] **Ads**: "No, my app does not contain ads".
- [ ] **App access**: "All functionality is available without special access" (no login needed; Google sign-in is optional).
- [ ] **Content rating**: fill the IARC questionnaire with the answers in `store/listing.md` (category Game; users
      interact: yes; shares location: no; digital purchases: no; no violence, no gambling).
- [ ] **Target audience and content**: **13 and over** (tick 13-15, 16-17, 18+; do not tick any group under 13).
      Reason: public farmer names, free-text gift notes and a shared market are not moderated for children, and
      ticking under-13 groups puts the app under the Families policy. "Could the store listing unintentionally appeal
      to children?": the art is cute, so answer honestly; if asked, explain the listing is aimed at teens and adults
      who enjoy cozy farming games. The privacy policy already says the game is not directed at children under 13.
- [ ] **News app**: No.
- [ ] **COVID-19 contact tracing / status**: No (if asked).
- [ ] **Data safety**: answers in `store/data-safety.md`, account deletion URL
      `https://cozyacres.joshmakesgames.app/delete-my-data/`.
- [ ] **Government app**: No.
- [ ] **Financial features**: "My app doesn't provide any financial features".
- [ ] **Health**: "My app does not have any health features" / No health apps declaration.
- [ ] **Advertising ID**: No, the app does not use the advertising ID (Bubblewrap apps do not include it).
- [ ] **Actions / foreground services / permissions declarations**: none needed (notifications are off in
      twa-manifest.json, no location delegation, no Play Billing).

## 4. Store listing (Grow users > Store presence)

- [ ] **Main store listing**: app name, short and full description from `store/listing.md`.
- [ ] Graphics: icon `design/cozy-acres-graphics/icons/google-play-icon-512.png`, feature graphic
      `design/cozy-acres-graphics/store/feature-graphic-1024x500.png`, phone screenshots `store/screenshots/phone-*.png`
      (8, order in listing.md), 7-inch and 10-inch tablet screenshots `store/screenshots/tablet-*.png`.
- [ ] **Store settings**: category Games > Simulation, tags, contact email, website.

## 5. Closed testing (required for new personal accounts)

New personal developer accounts must run a **closed test with at least 12 testers who stay opted in for at least
14 days in a row** before they can apply for production access.

- [ ] Testing > **Closed testing** > create a track (e.g. "Friends and family"), add testers by email list or Google Group.
      Recruit at least 14-15 people so you still have 12 if someone drops out.
- [ ] Upload the first `app-release-bundle.aab` there by hand (Create new release), release notes from listing.md.
      (Optional first: the same bundle to **Internal testing** to try it yourself within minutes.)
- [ ] After the first upload: copy the **App signing key certificate SHA-256** (Setup > App signing) and set
      `ANDROID_CERT_SHA256` to `<app signing SHA-256>,<upload key SHA-256>`, redeploy the website, and confirm the
      app from Play opens full screen without a browser bar.
- [ ] Send testers the opt-in link; ask them to install, play a few times and keep the app installed for 14 days.
- [ ] Ship fixes during the test if needed (website deploys update the game instantly; a new bundle needs a higher
      versionCode).
- [ ] Note feedback; Play asks about the test when you apply.

## 6. Production access and release

- [ ] Dashboard > **Apply for production** (available after 14 days with 12+ opted-in testers). Answer the
      questions about the test, what you changed, and readiness. Review usually takes up to about 7 days.
- [ ] Production > **Create new release**: promote the tested bundle (or build a new one with a higher versionCode),
      release notes for 1.3.0, countries: all (or start with a few).
- [ ] **Send for review**. Optionally use a staged rollout (e.g. 20%) for the first days.
- [ ] When live: put the Play link in `build.py` SITE settings (the other agent owns build.py; ask the lead), add the
      official badge, rebuild the website, and update the studio site.

## 7. After launch

- [ ] Keep `ANDROID_CERT_SHA256` correct forever (a wrong value brings the browser bar back for everyone).
- [ ] Each year Google raises the minimum target SDK: rebuild with a newer Bubblewrap (bump `BUBBLEWRAP_VERSION`,
      `ANDROID_BUILD_TOOLS` and `ANDROID_PLATFORM` in `.github/workflows/android.yml`) and upload with a higher versionCode.
- [ ] Answer deletion emails within 30 days (ONLINE.md, "Deleting accounts and data").
- [ ] Update `store/data-safety.md`, the privacy policy and the Play Data safety form whenever online features change.
