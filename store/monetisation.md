# Ads and gem purchases - Cozy Acres

Plan and paperwork for adding **rewarded ads** and **gem purchases** later, written so the switch is quick. Until
they are live, every Play Console answer must describe the app **as it is** (no ads, no purchases): declaring things
the app does not do is also a policy problem. What can be done early is listed in section 1.

Written 5 October 2026. Google's ad and billing rules change: re-check the linked policies when you start.

## 1. Do now (before the public launch)

- [x] Removed "No ads" promises from the store listing and the websites (players who were promised no ads leave
      angry reviews when ads arrive). The listing now says "Free to play" and keeps "every coin and gem can be
      earned just by playing", which stays true with purchases.
- [x] Privacy policy says the game does not show ads *at the moment* and that the policy will be updated before ads
      or purchases appear.
- [ ] **Keep the target audience 13+** (store/checklist.md section 3). Ticking any under-13 age group puts the app
      under the Families policy: only Families-certified ad networks, no personalised ads, stricter review.
- [ ] **Set up the payments profile** now, as verification can take days: Play Console > **Setup > Payments
      profile** (merchant account: legal name, address, bank account, tax details). Needed before you can create
      in-app products. It does not change anything players see.
- [ ] Keep **mystery crates earn-only** (as today: daily rewards, Collection Book pages, the truck depot). If crates
      or other random rewards could ever be bought with gems that were bought with money, Play's policy requires
      showing the odds before purchase, and some countries regulate it as loot boxes. Simplest rule: gems never buy
      random rewards.

## 2. How it works technically (Android app = website in Chrome)

The Play app is a Trusted Web Activity: it shows the live website full screen in Chrome. So ads and payments are
added to the **website**, with one Android-specific part for payments.

### Rewarded ads

- Use **Google AdSense H5 Games Ads** (the Ad Placement API: `adBreak()` with `type: 'reward'`). It is made for web
  games, supports rewarded and interstitial ads, and works in the Play app because the app is the website.
  (AdMob is for native Android code and would mean replacing the TWA with a native wrapper; not needed.)
- Steps: AdSense account for `cozyacres.joshmakesgames.app`, apply for H5 Games Ads, add the ad script to the game,
  publish `ads.txt` at the site root (the deploy can write it), set up the **consent message** (below).
- **Consent (EEA, UK, Switzerland):** Google requires a Google-certified consent management platform for ads shown
  there. The simplest is AdSense's own **Privacy & messaging** consent message (free). Players who decline still get
  non-personalised ads.
- Design rules that keep Cozy Acres cozy: **rewarded only, always optional** (e.g. "Watch an ad: double this
  harvest", "free speed-up", "+1 free cast"), a daily cap, never during the tutorial, never forced interstitials.
  Players who buy any gem pack could get ads switched off as a thank-you.

### Gem purchases

- **Inside the Play app, Google Play Billing is required** for digital goods like gems (Play's Payments policy).
  A TWA uses it through the **Digital Goods API** + Payment Request API. Bubblewrap supports this: set
  `"features": { "playBilling": { "enabled": true } }` in `android/twa-manifest.json`, build a new bundle with a
  higher versionCode and upload it. (This is the one change that needs a new app upload.)
- **In a normal web browser** Play Billing is not available. Either show the gem shop only in the Play app (simplest),
  or add a web payment provider such as Stripe later. The game detects which one it is in at runtime.
- Create the products in Play Console > **Monetise > Products > In-app products**, e.g. `gems_small` (consumable).
- **Verify purchases on the server**: a Supabase Edge Function checks each purchase token with the Google Play
  Developer API before granting gems, and records it (needed for refunds and support). Purchases must be
  acknowledged or consumed within 3 days or Google refunds them automatically.
- Restore: consumable gems are granted once; the server record prevents double grants after a reinstall.

## 3. Play Console changes when they go live

### Ads (App content > Ads)

- "Does your app contain ads?" **Yes**. The store listing then shows **Contains ads**.

### In-app purchases

- The store listing shows **In-app purchases** once products exist (with the billing-enabled bundle).
- **Content rating**: redo the questionnaire. "Does the app contain digital purchases?" **Yes**. The rating then
  lists "In-App Purchases". Randomised items purchasable with real money: **No** (keep crates earn-only).

### Data safety additions

Use the ad network's own published Data safety guidance at the time (Google publishes it for its ad products); it
usually means these rows **in addition** to `store/data-safety.md`:

| Data type | Collected | Shared | Purposes | Why |
| --- | --- | --- | --- | --- |
| Location > Approximate location | Yes | Yes (Google) | Advertising or marketing, Fraud prevention | Ad requests carry the IP address |
| Device or other IDs | Yes | Yes (Google) | Advertising or marketing, Analytics, Fraud prevention | Ad and cookie identifiers |
| App activity > App interactions | Yes | Yes (Google) | Advertising or marketing, Analytics | Ad views and taps |
| App info and performance > Diagnostics | Yes | Yes (Google) | Analytics, Fraud prevention | Ad SDK diagnostics |
| Financial info > Purchase history | Yes (when purchases exist) | No | App functionality, Account management | Purchase records kept to grant gems and handle refunds |

Card details are never collected: Google Play handles the payment.
The **Advertising ID** declaration (App content) stays "No" unless a native ad SDK is added; web ads in Chrome do
not read the Android advertising ID. Re-check this when you apply.

### Store listing

- Short description: unchanged.
- Full description: keep "Free to play, at your own pace - every coin and gem can be earned just by playing." Add a
  line near the end: `Optional gem packs and optional rewarded ads help support a tiny indie studio.`

### Privacy policy (replace in `design/cozy-acres-website/src/pages/privacy.html`)

Short version:
```
Cozy Acres is free to play. It shows optional rewarded ads (you choose when to watch one) and offers optional gem
packs through Google Play. We do not sell your information.
```

New section "Ads" (ads go live):
```
Cozy Acres shows optional rewarded ads from Google AdSense: an ad only plays when you choose to watch one for a
reward. To show and measure ads and prevent fraud, Google receives your IP address, device and browser information
and ad interactions, and may use cookies or similar identifiers. In the EEA, UK and Switzerland you are asked for
consent first and can change your choice at any time in Settings. See how Google uses information from sites that
use its services: https://policies.google.com/technologies/partner-sites
```

New section "Purchases" (gem packs go live):
```
Gem packs are sold through Google Play. Google handles the payment; we never see your card or bank details. We keep
a record of each purchase (product, time, order id and the account it belongs to) to give you your gems, restore
them if needed and handle refunds. Deleting your online account deletes these records, except where the law
requires us to keep them.
```

Also remove the "No advertising..." line under "What we do not do" and update the date at the top.

## 4. Switch-over checklist

1. Payments profile verified (section 1).
2. Build the ads and/or shop into the game; test on the closed test track first (game changes deploy instantly; the
   billing bundle needs a new upload).
3. Update the privacy policy (section 3) and deploy the website **before** the feature goes live.
4. Play Console: Ads declaration, content rating, Data safety, listing line.
5. Announce it honestly in the game's What's new (what is optional, that everything can still be earned).
6. Keep `delete_my_account()` deleting purchase records (or keep only what tax law requires, documented in the policy).
