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

This creates the `profiles`, `gifts`, `listings`, `cloud_saves` and `farm_snapshots` tables, the security rules (each player can only
change their own things), the server functions that make trades safe (a listing can only be bought once,
a gift claimed once) and turns on live updates. It is safe to run again after a game update.

**Re-run `supabase/schema.sql` after updating the game.** New features sometimes need new tables or server
functions (for example version 1.4.0 "Visiting" adds the `farm_snapshots` table and the `publish_farm`
function). Running the whole file again only adds what is missing; players' data is kept.
The "Helping neighbours" update adds the `farm_help` table and the `help_farm`, `like_farm`,
`farm_help_status` and `claim_farm_help` functions, so run it again for that too.
Version 1.8.0 "Village Friends" adds Ask a friend (`help_requests`, `help_fills`, `help_watch` and their functions,
push kind `help`), the game event log (`player_events` and `log_event`) and letters to every player
(`admin_letters`, `admin_letter_inbox`, `my_admin_letters`, `claim_admin_letter`), so run it again for 1.8 as well.

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
  cloud save, farm snapshot, their own market listings, every gift they sent or received and all neighbour
  help and likes they gave or got (`farm_help`, through the profile cascade). From 1.8 their Ask a friend
  requests and fills, game events (`player_events`) and letter deliveries (`admin_letter_inbox`) go too
  (`on delete cascade` from `auth.users`). Listings they bought from
  other players stay for the seller, with the buyer's name replaced by "A farmer". The farm on the device is
  not touched. This is the in-app account deletion Google Play asks for.
- By email: players can also ask at `joshmakesgames92@gmail.com`. Find them by friend code in **Table
  Editor > profiles** (or by Google email in **Authentication > Users**) and delete the user in
  **Authentication > Users**; the cascades remove the rest.
- The website's "Delete my data" form posts to `/api/delete-data`, which does **not** exist (the site is
  static). Until a small server function is added for it, point players to the in-game button or the email
  address above.

## Restoring a player's farm with a short code

When a player loses their farm and you have made them a farm link (`https://cozyacres.joshmakesgames.app/play/#farm=...`),
you can turn it into a short code they type in the game instead of a very long link.

1. Run the latest `supabase/schema.sql` once (it adds `farm_transfers` and two functions; safe to re-run).
2. **SQL Editor**, paste the whole farm link between the quotes and run:
   ```sql
   select public.make_farm_transfer('https://cozyacres.joshmakesgames.app/play/#farm=z.H4sI...', 'Mel restore');
   ```
   It returns a code like `K7QM-2XPA`.
3. Send the player the code. In the game (website or Play app): **Settings > Load a farm**, type the code,
   **Load farm**, then confirm. Their current farm is kept under Settings > Previous farm.

A code works for 14 days and up to 5 loads. Players cannot list codes; each player gets 10 wrong guesses an hour.
See your codes with `select code, note, claims, expires_at from farm_transfers order by created_at desc;`
and remove one early with `delete from farm_transfers where code = 'K7QM2XPA';` (no dash). Expired codes are
deleted automatically 30 days later. A code holds that player's farm, so only send it to them.

## Reward codes (coins and gems as a thank-you or apology)

Player gift codes are limited to 500 coins and no gems. For more, make a reward code on the server:

1. Run the latest `supabase/schema.sql` once (adds `reward_codes`; safe to re-run).
2. **SQL Editor**:
   ```sql
   select public.make_reward_code(20000);                                    -- 20,000 coins, one player
   select public.make_reward_code(20000, 100, 'Sorry about your farm!');     -- plus 100 gems and a note
   select public.make_reward_code(500, 5, 'Thanks for testing!', 15);       -- one code for up to 15 players
   ```
   Each returns a code like `K7QM-2XPA`.
3. The player types it in **Friends > Gift codes** and taps **Open**.

Each player can claim a code once. Codes last 30 days and work for `max_claims` players (default 1). See them
with `select code, coins, gems, claims, max_claims, note from reward_codes order by created_at desc;`.

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
| "Couldn't open this farm right now" or a server message about `farm_snapshots`, `farm_help` or the schema cache | In the Supabase SQL Editor run `notify pgrst, 'reload schema';` (it makes the API notice new tables), then re-run `supabase/schema.sql` if a table is missing. |
| Google says `redirect_uri_mismatch` | The redirect URI in the Google OAuth client must be exactly `https://<project>.supabase.co/auth/v1/callback` (step 6A). |
| After Google the game opens a different address (or the home page) | Add the game's exact address to Supabase **Redirect URLs** (step 6B). |
| Signing in gives the player a new friend code | Switch on **Manual linking** (step 6B). |
| "Cloud save: could not save" in Settings | Run `schema.sql` again (step 3) so `save_cloud` exists. The game retries on its own. |
| "Visit farm" always says **This farm hasn't been shared yet**, or the browser console shows `function public.publish_farm does not exist` / `relation "public.farm_snapshots" does not exist` | Run `supabase/schema.sql` again (step 3) so `farm_snapshots` and `publish_farm` exist. Each player's farm is shared a few seconds after they next open the game. |
| "Visit farm" says **Couldn't reach the village** | The device is offline or the server is paused. The player's own farm is never touched; they can try again later. |
| Visiting works but **Water it** / the like heart says "Could not reach the village", or the console shows `function public.help_farm does not exist` / `relation "public.farm_help" does not exist` | Run `supabase/schema.sql` again (step 3) so `farm_help` and its functions exist. Help that could not be sent is not lost from the visitor's farm; they can simply try again. |
| Free project paused after a week without players | Open the Supabase dashboard and click **Restore project**. |

## Good to know

- **Limits** (set in `schema.sql`): 10 open market listings per player, up to 999 items and 1,000,000 coins
  per listing, gifts of up to 10 kinds of items and 100,000 coins with a 140 character note, 30 gifts per
  player per day.
- **Trust model:** coins and items live in each player's own save (as before), so this is a friendly co-op
  setup, not a cheat-proof competitive one. The server makes sure the shared parts are fair: a listing sells
  once, a gift is claimed once, and players can only change their own profile and listings.
- **Visiting farms:** every player's farm layout is shared as a small "farm snapshot" (`farm_snapshots`, at
  most 64 KB): buildings, fields and their growth stage, fruit trees, animals, decorations, land, the farmer's look
  and pet, level and charm, as of the last time it was shared (at most every 5 minutes while playing and when the
  game is put in the background). Coins, items and the rest of the save are not in it. Visits are view only.
- **Helping neighbours:** a visitor can help each neighbour once per UTC day (water a growing field, feed an
  animal home or tend a fruit tree) and like their farm once per UTC day with an optional guestbook note picked
  from a preset list (no free text). These are rows in `farm_help`, written only through `help_farm()` and
  `like_farm()`, which refuse your own farm, unknown players, a second help or like on the same day, unknown
  notes, more than 50 rows per farm per day and more than 200 per helper per day. Owners read their own rows
  and helpers the rows they made. The owner's game applies the help when they next play (only if the field,
  home or tree still needs it) and marks the rows claimed with `claim_farm_help()`. Deleting either account
  removes its rows (foreign keys cascade).
- **Ask a friend (1.8):** requests a player posts and what friends send for them live in `help_requests` and
  `help_fills`; `help_watch` holds who wants to be told about new requests (push kind `help`). Friends can see
  each other's open requests.
- **Game events (1.8):** `log_event(kind, detail)` stores small named moments for the developer dashboard
  (`player_events`): at most 200 a day per player, a short kind and a small flat detail object, kept 180 days.
  Players cannot read them back. Nothing is sent in practice mode.
- **Letters to every player (1.8):** the dashboard's `admin_letter_all()` queues a letter; the game asks for
  undelivered ones with `my_admin_letters()` when it checks for developer gifts, claims each with
  `claim_admin_letter()` (exactly once) and puts it in the mailbox, signed by the team.
- **Privacy:** other players see your farmer's name, look, level, farm value, charm and weekly XP, and the
  layout of your farm when they visit it. Players
  who sign in with Google also store their Google email address and account id (in Supabase Auth) and a
  copy of their farm (`cloud_saves`, readable only by themselves). Nothing from the save is uploaded for
  players who do not sign in.
- **Housekeeping (optional):** run `select public.cleanup_old_rows();` in the SQL editor now and then to
  delete claimed gifts and finished listings older than 30 days.
- **Local development:** create a file `.env.local` next to `package.json` with
  `VITE_SUPABASE_URL=...` and `VITE_SUPABASE_ANON_KEY=...`, then `npm run dev`. Without it you get practice mode.

## Notifications (phone notifications, optional)

With this, players can switch on **Settings > Notifications** and get a gentle nudge when their crops, trees,
animals and goods are ready, when the delivery truck arrives, when something sells at their stall or on the
Shared Market, when a gift arrives, and a daily reward reminder. They choose which ones, and quiet hours
(21:00 to 08:00 by default: anything ready then waits until the morning). At most about 6 a day.

Where it works: Chrome on Android (also in the Play Store app, see [android/README.md](android/README.md)),
desktop Chrome, Edge and Firefox. On iPhone and iPad only when the game was added to the Home Screen
(iOS 16.4 or newer); the game explains this in Settings. Needs online play (steps 1 to 5 above). Until you
do the steps below, the Settings section says "Available when online play is switched on" and nothing else
changes.

How it works: the game knows when everything on the farm will be ready. When timers change (and when the
game goes to the background) it plans the next day's reminders and stores them on the server
(`push_schedule`). Gifts and market sales are added by the server itself. Every 5 minutes the database wakes
a small server function (`supabase/functions/send-push`), which sends whatever is due with Web Push.

**A. Make the VAPID keys (once)**

On any computer with Node.js, run:

```bash
npx web-push generate-vapid-keys
```

It prints a **Public Key** and a **Private Key**. Keep the private key secret (a password manager is a good
place). If you ever make new keys, every player has to switch notifications on again.

**B. GitHub: the public key**

Repository > **Settings** > **Secrets and variables** > **Actions** > **Variables** > **New repository variable**:
name `VITE_VAPID_PUBLIC_KEY`, value: the **Public Key**.

**C. Supabase: the server function and its secrets**

1. Make up a long random text for the cron secret, for example with `openssl rand -hex 24` (or 40 random
   letters and numbers). It stops strangers from waking the function.
2. **Edge Functions** > **Secrets** (on some dashboards: Project Settings > Edge Functions) > add:

   | Name | Value |
   | --- | --- |
   | `VAPID_PUBLIC_KEY` | the Public Key |
   | `VAPID_PRIVATE_KEY` | the Private Key |
   | `VAPID_SUBJECT` | `mailto:joshmakesgames92@gmail.com` |
   | `PUSH_CRON_SECRET` | the random text from step 1 |

   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are already there; do not add them.
3. Deploy the function, either way:
   - **Supabase CLI** (from the repository folder):
     ```bash
     npx supabase login
     npx supabase link --project-ref <your-project-ref>      # the part before .supabase.co
     npx supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:joshmakesgames92@gmail.com PUSH_CRON_SECRET=...
     npx supabase functions deploy send-push --no-verify-jwt
     ```
     (`secrets set` does the same as step 2.)
   - **Dashboard**: **Edge Functions** > **Deploy a new function** > **Via Editor**. Name it exactly
     `send-push`, replace the example code with all of
     [`supabase/functions/send-push/index.ts`](supabase/functions/send-push/index.ts), and click **Deploy**.
     Then open the function's **Details** / settings and switch **off** "Enforce JWT verification" (the timer
     sends the cron secret instead of a player's sign-in) and save.

**D. Supabase: the 5 minute timer**

1. **Database** > **Extensions**: search for `pg_cron` and switch it on, then `pg_net` and switch it on.
2. **SQL Editor**, new query, run (with your own address and the cron secret from C1):
   ```sql
   select vault.create_secret('https://<your-project>.supabase.co', 'cozy_project_url');
   select vault.create_secret('<the PUSH_CRON_SECRET text>', 'cozy_push_secret');
   ```
   (To change one later: `select vault.update_secret((select id from vault.secrets where name = 'cozy_push_secret'), '<new text>');`)
3. Run the latest [`supabase/schema.sql`](supabase/schema.sql) again (step 3). It adds the `push_subscriptions`
   and `push_schedule` tables, their functions, the gift and market sale triggers, and the timer job
   `cozy-send-push`. Check with `select jobname, schedule from cron.job;`. If the extensions were not on yet,
   the run says so in a notice; switch them on and run the file again.

Alternative to D2 and the timer in schema.sql: **Integrations** > **Cron** > **Create job**: name `cozy-send-push`,
schedule `*/5 * * * *`, type **Supabase Edge Function**, method POST, function `send-push`, and add the HTTP
header `x-cron-secret` with the cron secret. (This one calls the function every 5 minutes even when nothing is
due, which is fine on the free plan. Use one of the two, not both.)

**E. Re-run the deploy and try it**

1. GitHub **Actions** > **Deploy to GitHub Pages** > **Run workflow**.
2. Open the game (reload twice if it was installed, so the new service worker is used), **Settings >
   Notifications**, switch on **Phone notifications** and allow them. Tap **Send a test**: it arrives within
   5 minutes (with the game in the background or the phone locked; while you are looking at the game, only
   the test is shown).
3. In Supabase **Table Editor** you can see `push_subscriptions` (one row per device) and `push_schedule` (the
   planned reminders; `sent_at` and `status` fill in when they are sent).

**Good to know**

- Limits (in `schema.sql`): 30 planned reminders per player, at most 48 hours ahead, title 80 and text 200
  characters, 10 devices per player, at most 10 sent per player per day, one gift and one market sale
  notification per 30 minutes. A reminder more than 3 hours late (for example while the function was broken)
  is dropped, not sent. The push service keeps a message for at most 4 hours if the phone is off.
- Switching notifications off in Settings removes that device from the server. **Delete my online account**
  also removes all devices and planned reminders. Devices that were uninstalled or blocked notifications are
  removed automatically the next time a send fails with "gone".
- **Privacy:** for each device that switched notifications on, the server stores its push address
  (`endpoint`, a long address at Google, Mozilla, Apple or Microsoft's push service) with its encryption keys,
  the device's time zone and quiet hours, and the planned notification texts. Nothing else.
- Local testing: `node tools/test-notify.mjs` checks the planning rules (quiet hours, grouping, limits).
  `__notify.plan()` in the browser console shows what the game would schedule right now.

**Troubleshooting**

| What you see | What to do |
| --- | --- |
| Settings > Notifications says **Available when online play is switched on** | The build has no `VITE_VAPID_PUBLIC_KEY` (step B), or no online play (steps 1 to 5). Re-run the deploy and reload twice. |
| "On iPhone and iPad, add Cozy Acres to your Home Screen first" | Apple only allows notifications for Home Screen apps: Share > Add to Home Screen, then open it from there. iOS 16.4 or newer. |
| **Notifications are blocked for Cozy Acres** | The player said no once. Browser: the lock or settings icon next to the address > Notifications > Allow. Android app: Settings > Apps > Cozy Acres > Notifications. Then switch on again. |
| "Could not switch on notifications" | Private / incognito windows cannot get notifications in Chrome. Otherwise reload and try again. |
| **Waiting for a connection** under the switch | The device is offline or `schema.sql` was not run again (functions missing, browser console shows `function public.save_push_subscription does not exist`). Run step D3. The game retries on its own. |
| "Send a test" never arrives | Check, in order: `push_schedule` has the test row; if `sent_at` stays empty, the timer is not running (step D: `select * from cron.job;`, and `select status_code, content from net._http_response order by created desc limit 5;` shows the function's answers); if the status is `failed`, open **Edge Functions > send-push > Logs**. |
| Function answers `forbidden` | `PUSH_CRON_SECRET` and the Vault secret `cozy_push_secret` (or the Cron header) are not the same text. |
| Function answers `VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY secrets are missing` or `bad VAPID settings` | Step C2. The keys must be the pair printed together, and `VAPID_SUBJECT` must start with `mailto:`. |
| Function answers 401 "Invalid JWT" / "Missing authorization header" | JWT verification is still on: deploy with `--no-verify-jwt`, or switch it off in the function's settings (step C3). |
| Notifications stopped after making new VAPID keys | Expected: every player switches notifications off and on again in Settings (the game also does this by itself the next time it opens, if permission is still granted). |
| A warning `push_cron_tick: add the Vault secret cozy_project_url` in the database logs | Step D2. |
