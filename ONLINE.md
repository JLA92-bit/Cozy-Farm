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

This creates the `profiles`, `gifts` and `listings` tables, the security rules (each player can only
change their own things), the server functions that make trades safe (a listing can only be bought once,
a gift claimed once) and turns on live updates. It is safe to run again after a game update.

## 4. Copy the project URL and anon key into GitHub

1. In Supabase, open **Project Settings** (gear icon) > **API** (on newer dashboards: **Data API** for the
   URL and **API Keys** for the key).
2. Copy the **Project URL** (looks like `https://abcdefgh.supabase.co`).
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
| Free project paused after a week without players | Open the Supabase dashboard and click **Restore project**. |

## Good to know

- **Limits** (set in `schema.sql`): 10 open market listings per player, up to 999 items and 1,000,000 coins
  per listing, gifts of up to 10 kinds of items and 100,000 coins with a 140 character note, 30 gifts per
  player per day.
- **Trust model:** coins and items live in each player's own save (as before), so this is a friendly co-op
  setup, not a cheat-proof competitive one. The server makes sure the shared parts are fair: a listing sells
  once, a gift is claimed once, and players can only change their own profile and listings.
- **Privacy:** other players see your farmer's name, look, level, farm value, charm and weekly XP. Nothing
  else from your save is uploaded.
- **Housekeeping (optional):** run `select public.cleanup_old_rows();` in the SQL editor now and then to
  delete claimed gifts and finished listings older than 30 days.
- **Local development:** create a file `.env.local` next to `package.json` with
  `VITE_SUPABASE_URL=...` and `VITE_SUPABASE_ANON_KEY=...`, then `npm run dev`. Without it you get practice mode.
