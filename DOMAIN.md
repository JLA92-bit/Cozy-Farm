# Moving Cozy Acres to joshmakesgames.app

Where everything ends up:

| Address | What | Comes from |
| --- | --- | --- |
| `https://cozyacres.joshmakesgames.app/` | Cozy Acres website (privacy, support, delete my data, credits) | this repo |
| `https://cozyacres.joshmakesgames.app/play/` | the game | this repo |
| `https://joshmakesgames.app/` | Josh Makes Games studio homepage | a second repo (step 7) |

Until step 4 is done the same thing is served from the old address:
`https://jla92-bit.github.io/Cozy-Farm/` (website) and `https://jla92-bit.github.io/Cozy-Farm/play/` (game).
You do not need to change any code or settings in the deploy workflow: it notices the custom domain by itself.

**Do the steps in this order.** The order matters because of step 1.

## Why players need to move their farm

A browser keeps a website's saved data (the farm) separately for each address. Once the custom domain is
switched on, GitHub sends everyone from `jla92-bit.github.io/Cozy-Farm/...` to `cozyacres.joshmakesgames.app/...`,
and the farms saved on the old address can no longer be opened. So every player with a farm takes it with
them first (step 1), and opens it again on the new address afterwards (step 5).

---

## Step 1. Deploy this update and let players take their farm with them

1. Merge this update into `main`. The deploy runs by itself (repo **Actions** tab, "Deploy to GitHub Pages",
   wait for the green tick).
2. Check the old address works: `https://jla92-bit.github.io/Cozy-Farm/` now shows the website, and **Play now**
   opens the game at `https://jla92-bit.github.io/Cozy-Farm/play/`. The farm is still there (same address,
   same browser storage). If the game was installed as an app, open it once: it moves itself to `/play/`.
3. Every player with a farm, on every phone, tablet or computer they play on:
   - opens the game, **Settings** (gear) > **Move my farm to cozyacres.joshmakesgames.app**,
   - taps **Copy link** (or **Share**) and keeps the link somewhere safe, for example a note or a message to
     themselves.
   - Or: **Export save**, and keep the file.
   - Or: if online play is set up ([ONLINE.md](ONLINE.md)), **sign in with Google** once. The farm is then in
     the cloud and comes back after signing in on the new address.

   The link holds the farm as it is at that moment. Anything played after making the link is not in it, so
   make the link just before the switch, or make a new one. Long links are normal.

## Step 2. DNS at your domain registrar

Sign in where you bought `joshmakesgames.app` and open its **DNS** settings. Add:

| Type | Host / Name | Value / Points to | TTL |
| --- | --- | --- | --- |
| CNAME | `cozyacres` | `jla92-bit.github.io` | default (or 3600) |

- The value is exactly `jla92-bit.github.io`: no `https://`, no `/Cozy-Farm`, no trailing slash (some
  registrars add a final dot by themselves, `jla92-bit.github.io.`, that is fine).
- Some registrars want the full name `cozyacres.joshmakesgames.app` as the host. Use whichever form your
  registrar's help page shows.

For the studio homepage (step 7) you will also need these on the bare domain (host `@`). You can add them now
or in step 7:

| Type | Host | Value |
| --- | --- | --- |
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| AAAA | `@` | `2606:50c0:8000::153` |
| AAAA | `@` | `2606:50c0:8001::153` |
| AAAA | `@` | `2606:50c0:8002::153` |
| AAAA | `@` | `2606:50c0:8003::153` |
| CNAME | `www` | `jla92-bit.github.io` (optional, so `www.joshmakesgames.app` works too) |

These are GitHub Pages' addresses as documented today. Double check them on GitHub's page
"Managing a custom domain for your GitHub Pages site" before saving
(<https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site>).
Remove any other A, AAAA or "parking"/"forwarding" records the registrar added for `@` or `cozyacres`.
If the domain has CAA records, one must allow `letsencrypt.org` (no CAA records at all is also fine).

**About .app domains:** every `.app` address only works over `https://` (browsers enforce it for the whole
`.app` ending). So the new address will not open at all until GitHub has made its certificate in step 4.
An error like "your connection is not private" or "can't be reached" before then is expected.

## Step 3. Verify the domain with GitHub (protects it from takeover)

1. On GitHub, click your profile picture > **Settings** (your account settings, not the repo) > **Pages**.
2. **Add a domain**, type `joshmakesgames.app`, click **Add domain**.
3. GitHub shows a **TXT** record, something like host `_github-pages-challenge-jla92-bit` and a long value.
   Add exactly that TXT record at your registrar (step 2's DNS page). For the host, some registrars want
   only `_github-pages-challenge-jla92-bit`, others the full `_github-pages-challenge-jla92-bit.joshmakesgames.app`.
4. Back on GitHub, click **Verify**. It can take a few minutes to a few hours for DNS to update. Keep the TXT
   record afterwards: GitHub checks it from time to time.

This covers `cozyacres.joshmakesgames.app` and every other name under `joshmakesgames.app`.

## Step 4. Switch the game's repo to the domain

Only after step 1 has been given time (players have their links).

1. Open the **Cozy-Farm** repo > **Settings** > **Pages**.
2. Under **Custom domain** type `cozyacres.joshmakesgames.app` and click **Save**.
3. Wait for "DNS check successful" (refresh the page now and then; minutes to a few hours).
4. When it lets you, tick **Enforce HTTPS**. If the box is greyed out, the certificate is still being made:
   wait (up to about an hour, sometimes longer) and refresh.
5. Re-run the deploy: repo **Actions** > **Deploy to GitHub Pages** > **Run workflow** (on `main`). It now
   builds for the new address by itself (website at `/`, game at `/play/`).

From now on, `https://jla92-bit.github.io/Cozy-Farm/...` redirects to `https://cozyacres.joshmakesgames.app/...`.
Between saving the domain and the re-run finishing (a couple of minutes) the new address can look broken.
That fixes itself when the run finishes.

## Step 5. Bring the farms across

1. Open `https://cozyacres.joshmakesgames.app/play/`. Check the website at
   `https://cozyacres.joshmakesgames.app/` and the privacy page at `/privacy/` too.
2. Each player opens the link they kept in step 1 (tap it, or paste it in the address bar). The game shows
   **Load this farm?** with the farmer's name, level and coins. Tap **Load farm**. Nothing is replaced
   without that tap, and the farm that was there before is kept under **Settings > Previous farm**.
3. Players who exported a file use **Settings > Import save** instead. Players who signed in with Google sign
   in again from Settings.
4. If the game was installed as an app on a phone or computer, install it again from the new address (the old
   app icon pointed at the old address).

## Step 6. Online play: Supabase and Google sign-in

Only if online play is set up ([ONLINE.md](ONLINE.md), step 6).

1. Supabase > **Authentication** > **URL Configuration**:
   - **Site URL**: `https://cozyacres.joshmakesgames.app/play/`
   - **Redirect URLs** include `https://cozyacres.joshmakesgames.app/play/` (keep the old
     `https://jla92-bit.github.io/Cozy-Farm/play/` entry for now; it does no harm).
2. Google Cloud console > **Credentials** > your OAuth client: **Authorised JavaScript origins** must include
   `https://cozyacres.joshmakesgames.app` (already listed in ONLINE.md). The redirect URI stays the Supabase one.
3. In the game on the new address, **Settings > Sign in with Google** should go to Google and come back to
   `/play/`.

## Step 7. The studio homepage (joshmakesgames.app)

1. Done: the repo `JLA92-bit/joshmakesgames-site` already holds the studio site (copied from
   `design/studio/website/`) with a `CNAME` file containing `joshmakesgames.app`. To update it later, change
   `design/studio/website/` here and copy the files across again (or ask Claude to).
2. Until step 4 below is finished, opening `https://joshmakesgames.app/` shows "Your connection is not private"
   (`NET::ERR_CERT_COMMON_NAME_INVALID`). That is expected: the domain already points at GitHub, but GitHub only
   issues the certificate once a repo claims the domain.
3. New repo > **Settings** > **Pages**: **Source** "Deploy from a branch", branch `main`, folder `/ (root)`,
   **Save**. (Or use GitHub Actions if you prefer.)
4. **Custom domain**: `joshmakesgames.app`, **Save**. The A and AAAA records from step 2 must be in place.
   Wait for the DNS check, then tick **Enforce HTTPS**.
5. Open `https://joshmakesgames.app/`. Its **Play now** button already points to
   `https://cozyacres.joshmakesgames.app/play/`.

## Android app link (later)

When the Android app (Trusted Web Activity) is signed, add two repository variables in the Cozy-Farm repo
(**Settings** > **Secrets and variables** > **Actions** > **Variables**):
`ANDROID_PACKAGE` (the app id) and `ANDROID_CERT_SHA256` (Play Console > **Test and release** > **App integrity**
> **App signing key certificate**, SHA-256, looks like `AB:CD:...`). Re-run the deploy and check
`https://cozyacres.joshmakesgames.app/.well-known/assetlinks.json` opens. Android only looks for this file at
the root of a domain, so it only works after step 4.

## Troubleshooting

| What you see | What to do |
| --- | --- |
| "Your connection is not private" / `NET::ERR_CERT_COMMON_NAME_INVALID` | No repo has claimed that domain yet, or GitHub has not issued its certificate. Set the custom domain in that repo's **Settings** > **Pages** (step 4 or step 7), wait until the page says the certificate is ready (minutes to an hour, rarely up to 24 h), then tick **Enforce HTTPS**. |
| GitHub says the DNS check failed or is still running | DNS changes can take up to 24 hours to reach everyone (usually minutes). Check the record has no typo (`cozyacres`, `jla92-bit.github.io`), then wait and click **Check again**. You can see what the world sees at <https://dnschecker.org> (type `cozyacres.joshmakesgames.app`, record CNAME). |
| "Enforce HTTPS" is greyed out, or the certificate is "pending" | GitHub is still making the certificate. Wait up to an hour or so. If it is stuck for a day: remove the custom domain, **Save**, add it again. |
| The new address does not open at all ("can't be reached", "not private") | Expected until the certificate exists (`.app` is https-only). See the row above. |
| "The custom domain is already taken" or "is already in use" | The domain is not verified for your account yet, or another repo uses it. Do step 3 (verify), then try again. Check no other repo of yours has the same custom domain. |
| The new address shows the site but images or the game are missing, or `/play/` shows "page not found" | The deploy ran before the domain was saved. Re-run the deploy (step 4.5). |
| A player's link says "Could not open that farm link" | The link was cut off when it was copied or sent. Make a new link on the old address before the switch, or use Export save / Import save. |
| A player forgot to move the farm before the switch | Temporarily remove the custom domain (repo Settings > Pages > Remove), re-run the deploy, have them open `https://jla92-bit.github.io/Cozy-Farm/play/` and make the link, then do step 4 again. |
| Google sign-in comes back to the wrong page | Step 6: the Site URL and Redirect URLs must match the game's address exactly, with the trailing `/`. |
