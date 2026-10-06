# Admin dashboard - Cozy Acres

A private dashboard for running the game: **https://cozyacres.joshmakesgames.app/admin/**

Only Google accounts on the admin list can use it. Every check happens on the server (`admin_*` functions in
`supabase/schema.sql`), so the page itself holds no secrets: anyone else who opens it sees "not on the admin list"
and gets nothing. Every action is written to the admin log (System & log).

## One-time setup (about 5 minutes)

1. **Database:** Supabase > SQL Editor > paste the whole latest `supabase/schema.sql` > Run. Safe to run again.
2. **Admin list:** in a new query, run (with your own Google address; it is never stored in this repository):
   ```sql
   insert into public.admin_users (email) values ('you@gmail.com') on conflict do nothing;
   ```
3. **Sign-in address:** Supabase > Authentication > URL Configuration > Redirect URLs > Add URL:
   `https://cozyacres.joshmakesgames.app/admin/` > Save. (Google sign-in is already set up for the game.)
4. Open https://cozyacres.joshmakesgames.app/admin/ and press **Sign in with Google**.

Keep two-step verification on that Google account: it is the key to the dashboard. To remove an admin:
`delete from public.admin_users where email = 'someone@gmail.com';`

## What it does

| Page | What you can do |
| --- | --- |
| **Overview** | Players, who played today/this week/month, play time, sessions, new players, Google backups, notifications, charts over 14-180 days, the **closed test tracker** (who played in the last 14 days), retention by start week, levels, busiest weekdays, platform (Play app / web app / browser) and game versions in use, most played, community activity. Every chart has a table view. |
| **Players** | Search by name, farm, friend code, email or id. Filter (played this week, away 2+ weeks, no cloud backup, gift waiting...), sort, page, **export CSV**. |
| **Player page** | Stats, account, play calendar, map of their farm, **give a gift** (coins, gems, items, land plots - arrives by itself), **download save file** / **rebuilt save** / **farm code** (restore), backups, hide from leaderboards, notes, gifts and market history, their feedback, **delete player**. |
| **Gifts** | Gift a group (everyone, played this week / 2 weeks / month, Google players) and see every gift and whether it was picked up. |
| **Codes** | Make reward codes (coins and gems, for 1 or many players, with expiry) and farm codes from a link; see who used them; delete. |
| **Backups** | Back up every farm now, download any backup as a save file, **download everything** in one file. |
| **Feedback** | Messages from Settings > Send feedback, with level, version and device. Mark seen/done, keep notes. |
| **Market** | Open listings (take one down: the seller gets the items back as a gift) and best sellers. |
| **Leaderboards** | All four boards with a Hide/Show switch per player. |
| **Notifications** | Send a phone notification to everyone with notifications on, or only recent players. |
| **System & log** | Database size against the free plan, table sizes, scheduled jobs and failures, removing old empty accounts, and the admin log. |

## Restoring a player's farm

1. Players > find them > open their page.
2. **Google players** (badge "Cloud save"): Download save file, or Farm code from cloud save. That is everything.
3. **Others** (badge "Layout only"): Download rebuilt save, or Farm code from layout. The farm comes back from the
   layout neighbours see (land, buildings, decor, animals, fields, level); coins, gems and barn items are not in it, so
   you choose them (a suggestion for their level is filled in). Older layouts are under Backups.
4. Send them the file (Settings > Import save) or the code (Settings > Load a farm).
5. Then gift anything extra from their page; it arrives by itself.

## How things reach players

- **Gifts:** the game checks when it opens and every 5 minutes; players see "A gift for you!" with your message.
  Land plots open next to their farm (later plots cost the same as if bought). Cancel any gift until it is picked up.
- **Play statistics** are sent by the game from version 1.7.0 (sessions, minutes while the game is visible, version,
  platform). Older days show only "last seen".
- **Daily backups** run at 03:17 UTC when pg_cron is enabled (System & log shows the job). Unchanged farms are skipped,
  backups are kept 60 days (the newest per player always).

## Privacy

The dashboard shows personal data (Google emails, feedback, play times). Do not share screenshots of it or the
"Download everything" file. All of it is covered by the privacy policy and is deleted when a player deletes their
online account (everything is linked to the account with `on delete cascade`).
