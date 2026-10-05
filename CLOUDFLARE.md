# Moving the website and game to Cloudflare Pages

Why: so the GitHub repository can be **private** (nobody can read or download the source code) while the site stays
free. GitHub still builds the site on every push to `main`; the deploy workflow (`.github/workflows/deploy.yml`)
then uploads only the finished files to Cloudflare Pages.

Nothing changes for players: same address (`https://cozyacres.joshmakesgames.app/` and `/play/`), same saves,
Google sign-in, notifications and Android app. The studio site (`joshmakesgames.app`) is a separate repository and
stays where it is.

Until step 2 is done, the workflow keeps deploying to GitHub Pages exactly as before, so nothing breaks while you
work through this. About 15 minutes.

## 1. Create a Cloudflare API token (only allowed to deploy Pages)

1. Cloudflare dashboard > your profile icon (top right) > **My Profile** > **API Tokens** > **Create Token**.
2. At the bottom, **Custom token** > **Get started**.
3. Token name: `GitHub deploy - Cozy Acres`.
4. Permissions: **Account** | **Cloudflare Pages** | **Edit**. (Only this one line.)
5. Account Resources: **Include** | your account.
6. **Continue to summary** > **Create Token**. Copy the token now (Cloudflare shows it only once).

Your **Account ID**: dashboard home > **Workers & Pages** (left menu); the Account ID is shown on the right side of
that page (or in the address bar: `dash.cloudflare.com/<account id>/...`).

## 2. Add two GitHub secrets

GitHub > `Cozy-Farm` repository > **Settings** > **Secrets and variables** > **Actions** > **New repository secret**:

| Name | Value |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | the token from step 1 |
| `CLOUDFLARE_ACCOUNT_ID` | your Account ID |

## 3. Run the first Cloudflare deploy

1. GitHub > **Actions** > **Deploy website and game** > **Run workflow** (branch `main`) > **Run workflow**.
2. When it is green, open `https://cozy-acres.pages.dev/` and `https://cozy-acres.pages.dev/play/`. The website and
   game should load. (Saves there are separate from your real farm, because it is a different address; that is
   normal and only for this check. Google sign-in will not work on this test address.)

The first run also creates the Pages project `cozy-acres` in Cloudflare (Workers & Pages).

## 4. Point cozyacres.joshmakesgames.app at Cloudflare Pages

1. Cloudflare > **Workers & Pages** > **cozy-acres** > **Custom domains** > **Set up a custom domain**.
2. Enter `cozyacres.joshmakesgames.app` > **Continue** > **Activate domain**.
3. Cloudflare manages your DNS, so it updates the record for you. If it says a record already exists: go to
   **joshmakesgames.app** > **DNS** > **Records**, delete the `cozyacres` CNAME that points to `jla92-bit.github.io`,
   and press Activate again. It usually goes live within a few minutes (the certificate is issued automatically).
4. Check `https://cozyacres.joshmakesgames.app/play/` loads, and that **Settings** in the game shows your farm as
   before. Sign in with Google once to be sure it still comes back to the game.

## 5. Switch off GitHub Pages and make the repository private

1. GitHub > `Cozy-Farm` > **Settings** > **Pages**: remove the custom domain, then **Unpublish site** (if shown).
2. **Settings** > **General** > bottom (**Danger Zone**) > **Change repository visibility** > **Make private** and
   confirm.
3. Push or re-run the deploy once more to confirm it still goes to Cloudflare (the log says "Deploying to Cloudflare
   Pages").

Done. From now on every push to `main` (and every "deploy" I do) goes live on Cloudflare in about a minute.

## Good to know

- **Free limits:** Cloudflare Pages free plan has unlimited visitors and bandwidth and 500 deploys a month. Private
  GitHub repositories get 2,000 free Actions minutes a month; a deploy uses 1 to 2 minutes, an Android build about 10.
- **Old address:** `jla92-bit.github.io/Cozy-Farm` already forwards to the new address, so switching GitHub Pages
  off changes nothing for players. The emergency trick in DOMAIN.md for a player who forgot to move their farm
  (temporarily removing the custom domain) is no longer possible after step 5.
- **On GitHub Free, private repositories** do not enforce branch rules or secret scanning push protection. You are
  the only person with access, so that is fine; just keep two-factor login on.
- **Cache rules:** `scripts/pages/_headers` makes sure the files that decide which version a phone runs
  (`sw.js`, `index.html`, `assets/manifest.json`) are always fresh, so updates reach phones reliably.
- **Android app:** `/.well-known/assetlinks.json` is uploaded and served as JSON, so the app still opens without a
  browser bar.
- **Licence:** the project is now "All rights reserved" (`LICENSE`). Third-party assets keep their own licences
  (`CREDITS.md`).
