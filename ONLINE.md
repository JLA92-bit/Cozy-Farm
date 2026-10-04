# Online play (friends, gifts, shared market, leaderboards)

Cozy Acres works without any server: out of the box it runs in **Practice mode**, where friends, gifts,
the shared market and leaderboards work inside your own browser with a few demo neighbours (clearly
labelled as demo). To play with real people, connect a free **Supabase** project. It takes about
15 minutes and needs no programming. You only do this once.

What you need: the GitHub repository that hosts the game (with GitHub Pages already working, see the
README) and a free Supabase account.

## 1. Create a free Supabase project

1. Go to <https://supabase.com> and sign up (the free plan is enough).
2. Click **New project**. Pick any name (for example `cozy-acres`), choose a strong database password
   (save it somewhere, the game does not need it), and pick the region closest to your players.
3. Wait a minute or two until the project is ready.

## 2. Turn on anonymous sign-ins

Players do not need an account or e-mail: the game signs them in anonymously in the background.

1. In your project, open **Authentication** (left menu), then **Sign In / Providers**
   (on older dashboards: **Providers** or **Settings**).
2. Find **Allow anonymous sign-ins** and switch it **on**. Click **Save**.
3. Recommended: under **Authentication > Attack Protection** you can turn on CAPTCHA later if you ever
   see abuse. It is not needed to get started.

## 3. Create the tables (run schema.sql)

1. In your project, open **SQL Editor** (left menu) and click **New query**.
2. Open the file [`supabase/schema.sql`](supabase/schema.sql) from this repository, copy **all** of it and
   paste it into the editor.
3. Click **Run**. You should see "Success. No rows returned".

This creates the `profiles`, `gifts`, `listings` and `cloud_saves` tables, the security rules (each player can only
change their own things), the server functions that make trades safe (a listing can only be bought once,
a gift claimed once) and turns on live updates. It is safe to run again after a game update.

## 4. Copy the project URL and anon key into GitHub

1. In Supabase, open **Project Settings** (gear icon) > **API** (on newer dashboards: **Data API** for the
   URL and **API Keys** for the key).
2. Copy the **Project URL** (looks like `https://abcdefgh.supabase.co`, nothing after `.co`). Not the
   "RESTful endpoint" that ends in `/rest/v1` (the game now strips that, but use the plain URL).
3. Copy the **anon / public** key (a long text starting with `eyJ...`, or a newer `sb_publishable_...` key).
   This key is meant to be public: it is safe in a website. **Never** use the `service_role` / secret key.
4. In GitHub, open your repository > **Settings** > **Secrets and variables** > **Actions**.
5. Open the **Variables** tab and click **New repository variable** twice:
   - Name `VITE_SUPABASE_URL`, value: the Project URL.
   - Name `VITE_SUPABASE_ANON_KEY`, value: the anon key.

   (Adding them as **Secrets** instead of Variables also works.)

## 5. Re-run the deploy

1. In GitHub, open the **Actions** tab, pick **Deploy to GitHub Pages** on the left, click **Run workflow**
   and confirm. (Any new push to `main` also deploys.)
2. When it is green, open the game. In **Settings > Online play** the status should say **Online** and show
   your friend code. Players who already had the game open get the new version after a reload.

## 6. Sign in with Google and cloud saves (optional, recommended)

With this, players can tap **Sign in with Google** in Settings > Online play. Their farm is then backed up
to the cloud and comes back on any other device (or in the Android app) when they sign in with the same
Google account. Their friend code, friends, market listings and gifts stay the same: Google is *linked* to
the anonymous account they already have. Until you do this step the button shows an error message when
tapped, and everything else keeps working.

**A. Google Cloud console (makes the Google login screen)**

1. Go to <https://console.cloud.google.com>, sign in, and create a project (for example `Cozy Acres`).
2. Open **APIs & Services > OAuth consent screen** (on newer consoles: **Google Auth Platform > Branding**).
   Choose **External**, enter the app name `Cozy Acres`, your support email `joshmakesgames92@gmail.com`,
   and the developer contact email. Scopes: the default `email`, `profile` and `openid` are all that is
   needed. Add your privacy policy link. Then **Publish** the app (Audience > Publish app) so any Google
   account can sign in, not only test users.
3. Open **APIs & Services > Credentials** (or **Clients**) > **Create credentials > OAuth client ID**.
   - Application type: **Web application**.
   - Authorised JavaScript origins: `https://cozyacres.joshmakesgames.app`, `https://jla92-bit.github.io`
     and `http://localhost:5173`.
   - Authorised redirect URIs: **`https://<your-project>.supabase.co/auth/v1/callback`** (your Supabase
     Project URL from step 4 followed by `/auth/v1/callback`; Supabase also shows it in the Google
     provider settings below). This is the only redirect URI Google needs.
4. Click **Create** and copy the **Client ID** and **Client secret**.

**B. Supabase**

1. **Authentication > Sign In / Providers > Google**: switch it on, paste the Client ID and Client secret,
   and **Save**.
2. **Authentication > Sign In / Providers** (or **Settings**): switch on **Allow manual linking**
   ("Manual linking"). This is what lets the game link Google to a player's existing anonymous account.
   Without it the game falls back to a plain Google sign-in, and the player gets a new friend code.
   Keep **Allow anonymous sign-ins** on.
3. **Authentication > URL Configuration**:
   - **Site URL**: `https://jla92-bit.github.io/Cozy-Farm/play/` for now. Change it to
     `https://cozyacres.joshmakesgames.app/play/` once the custom domain is live (DOMAIN.md step 4). Supabase
     falls back to this address whenever a return address is not on the list below.
   - **Redirect URLs** (add each one): `https://cozyacres.joshmakesgames.app/play/`,
     `https://jla92-bit.github.io/Cozy-Farm/play/` (the game is at `/play/` on the old address too, until
     the custom domain is switched on, see [DOMAIN.md](DOMAIN.md)), `https://jla92-bit.github.io/Cozy-Farm/`
     (older builds) and `http://localhost:5173/` (for development). If the game ever moves to another address, add that
     address here too. The game sends players back to the exact page they signed in from (without
     `?` or `#`), so each address must be listed exactly, with the trailing `/`.
4. Run the latest [`supabase/schema.sql`](supabase/schema.sql) again (step 3). It adds the `cloud_saves`
   table and the `save_cloud` and `delete_my_account` functions. Nothing else changes for players.

No new GitHub variables are needed. **Android app (Trusted Web Activity):** the app is the website running
in Chrome, so Google sign-in works there exactly as on the web (the sign-in page opens in the same Chrome
window and comes back to the game). Players who signed in on the website just sign in again in the app and
their farm appears.

**How cloud saves behave**

- Only for players signed in with Google. Anonymous players keep saving on their device only.
- The farm is uploaded at most every 2 minutes while it changes, when the game is put in the background,
  right after signing in, and with **Save now** in Settings. Never while nothing changed.
- On sign-in (and every start while signed in) the cloud farm is compared with the one on the device. If the
  device just continues its own cloud farm, or the device farm has not been started yet, it happens
  automatically. Otherwise the player sees **We found a farm in the cloud** with both farms side by side and
  picks one. The farm that is not picked is kept on the device (Settings > Your farm > Previous farm).
- Cloud farms are checked like an imported save before they are used. Limit: 512 KB per farm.
- **Sign out** keeps the farm on the device; the next time the game goes online it gets a fresh anonymous
  account (new friend code). Signing in with Google again brings the account and cloud farm back.

## Deleting accounts and data

- In the game: **Settings > Online play > Delete my online account** (two confirmations). It calls
  `delete_my_account()`, which deletes the player's sign-in (`auth.users`), public profile and friend code,
  cloud save, their own market listings and every gift they sent or received. Listings they bought from
  other players stay for the seller, with the buyer's name replaced by "A farmer". The farm on the device is
  not touched. This is the in-app account deletion Google Play asks for.
- By email: players can also ask at `joshmakesgames92@gmail.com`. Find them by friend code in **Table
  Editor > profiles** (or by Google email in **Authentication > Users**) and delete the user in
  **Authentication > Users**; the cascades remove the rest.
- The website's "Delete my data" form posts to `/api/delete-data`, which does **not** exist (the site is
  static). Until a small server function is added for it, point players to the in-game button or the email
  address above.

## Checking that it works

- Open the game on two devices (or one normal and one private window). Each shows its own friend code in
  Settings > Online play.
- Add each other with the friend code, send a gift, put something on the market and buy it from the other one.
- In Supabase **Table Editor** you can see the rows appear in `profiles`, `gifts` and `listings`.

## Troubleshooting

| What you see | What to do |
| --- | --- |
| Settings says **Practice mode** after deploying | The variables were not in the build. Check the names are exactly `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, then re-run the deploy and reload the game (twice if it was installed as an app). |
| Settings says **Offline** | The device has no internet, or the URL/key is wrong, or anonymous sign-ins are off (step 2). The game keeps working and retries on its own. |
| "Anonymous sign-ins are disabled" in the browser console | Do step 2. |
| Errors like `function public.buy_listing does not exist` | Run `supabase/schema.sql` again (step 3). |
| Tapping **Sign in with Google** shows "Could not reach Google sign-in" | The device is offline, or the Supabase URL is wrong. |
| A page with `{"message":"No API key found in request", ...}` after tapping **Sign in with Google** | The browser landed on Supabase's database API. Look at the address bar: if it contains `/rest/v1`, the `VITE_SUPABASE_URL` variable has `/rest/v1` on the end - set it to just `https://<project>.supabase.co` and re-run the deploy (newer builds strip it automatically). If it is just `https://<project>.supabase.co/...` after choosing your Google account, the Google OAuth client's redirect URI must be exactly `https://<project>.supabase.co/auth/v1/callback` (step 6A) and the Supabase **Site URL** must be the game's address, not the Supabase URL (step 6B). |
| Google says `redirect_uri_mismatch` | The redirect URI in the Google OAuth client must be exactly `https://<project>.supabase.co/auth/v1/callback` (step 6A). |
| After Google the game opens a different address (or the home page) | Add the game's exact address to Supabase **Redirect URLs** (step 6B). |
| Signing in gives the player a new friend code | Switch on **Manual linking** (step 6B). |
| "Cloud save: could not save" in Settings | Run `schema.sql` again (step 3) so `save_cloud` exists. The game retries on its own. |
| Free project paused after a week without players | Open the Supabase dashboard and click **Restore project**. |

## Good to know

- **Limits** (set in `schema.sql`): 10 open market listings per player, up to 999 items and 1,000,000 coins
  per listing, gifts of up to 10 kinds of items and 100,000 coins with a 140 character note, 30 gifts per
  player per day.
- **Trust model:** coins and items live in each player's own save (as before), so this is a friendly co-op
  setup, not a cheat-proof competitive one. The server makes sure the shared parts are fair: a listing sells
  once, a gift is claimed once, and players can only change their own profile and listings.
- **Privacy:** other players see your farmer's name, look, level, farm value, charm and weekly XP. Players
  who sign in with Google also store their Google email address and account id (in Supabase Auth) and a
  copy of their farm (`cloud_saves`, readable only by themselves). Nothing from the save is uploaded for
  players who do not sign in.
- **Housekeeping (optional):** run `select public.cleanup_old_rows();` in the SQL editor now and then to
  delete claimed gifts and finished listings older than 30 days.
- **Local development:** create a file `.env.local` next to `package.json` with
  `VITE_SUPABASE_URL=...` and `VITE_SUPABASE_ANON_KEY=...`, then `npm run dev`. Without it you get practice mode.
