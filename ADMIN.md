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
| **Players** | Filter **Locked accounts** and a Locked badge with the end date. Search by name, farm, friend code, email or id. Filters: playing right now, played today, this week, new, regulars (30+ days), drifting away (gone 1-4 weeks), away 2+ weeks, level 60+, Google backup or none, notifications on, new feedback, gift waiting, has notes, leaderboard flag, hidden. Sort by last seen, level, total XP, farm value, charm, XP this week, play time this week or ever, days, sessions, newest, name. Shows who is playing now and this week's play time. **Export CSV**. |
| **Player page** | Everything about one player, in tabs. A header with their look, badges (playing now, Google, cloud save, notifications, old version, flags) and key numbers, and a toolbar: **gift**, **letter** (just to them, arrives in their mailbox), **phone notification** (just to them), download save, farm code, rebuild from layout, hide/show on leaderboards, **clear a leaderboard flag**, copy id / friend code / a support summary, note, **export everything** (one JSON), delete. Tabs: **Overview** (their story in sentences: favourite crop, busiest workshop, best villager friend, who they play with, ranks; things to look at; this week vs last; calendar; latest events), **Farm** (map, fields, workshops with wear and what they are making, every animal by name with love and health, decorations), **Barn and items** (every item with icons, silver/gold stars, worth, filter and sort; stored buildings), **Progress** (villager hearts, skills and perks, every building project room by room, Museum, Wildlife Album, achievements, mastery, farmhands, Master Board, festivals, fishing, critters, quests), **Lifetime stats** (top crops, workshops, animal products, fish and gold stars; every counter), **Activity** (calendar, minutes a day, hour of day, weekday, devices and versions, every game event with a kind filter, day by day), **Friends and social** (friends list, who they play with most, gifts, market, Ask a friend, Village Projects, visits and help), **Support** (account, save and backups, developer gifts, letters and whether read, notifications sent, fair-play allowances, reward codes, notes, feedback, everything admins did for them), **Raw data** (searchable). Opening a page with a cloud save logs "view save". Needs the `admin player deep dive` section of `supabase/schema.sql`. |
| **Gifts** | Gift a group (everyone, played this week / 2 weeks / month, Google players) and see every gift and whether it was picked up. |
| **Codes** | Make reward codes (coins and gems, for 1 or many players, with expiry) and farm codes from a link; see who used them; delete. |
| **Backups** | Back up every farm now, download any backup as a save file, **download everything** in one file. |
| **Feedback** | Messages from Settings > Send feedback, with level, version and device. Mark seen/done, keep notes. |
| **Reports** | Players reporting other players (1.33). The badge counts open reports. See "Reports" below. |
| **Market** | Open listings (take one down: the seller gets the items back as a gift) and best sellers. |
| **Leaderboards** | All four boards with a Hide/Show switch per player. |
| **Notifications** | Send a phone notification to everyone with notifications on, or only recent players. |
| **Visits & help** (1.28.2) | Visits a day, how many visits ended with a help, how many found **nothing to help with**, how old the farm pictures were, help refused (already today, farm busy, offline), helps and likes by kind, help the owner has not picked up yet, most helpful players and most visited farms, guestbook notes, **shared farms**: players who played lately but whose farm picture is 2+ days old (with the server's refusal reason), the biggest farms against the 3,000-piece limit, problems the game reported, and Village Projects (open, finished, ran out of time, gifts). The player page has a **Visits and help** card too. Needs the `1.28.2 visits and help` section of `supabase/schema.sql`. |
| **1.8.5 Square** | Which village square rooms and bundles players finish, how many players reached skill level 5 and 10 in each skill, and which skill perks players choose. |
| **1.9 Year** | Game settings you can change without a release (which weekday is market day, the weather for one date), festival plays and prizes per festival, Wild Woods visits, forage, digs, expeditions, Museum pieces and shelves, Help Wanted. Needs the `1.9 a year in the valley` section of `supabase/schema.sql` run in Supabase. |
| **1.8 Village** | The 1.8 welcome funnel (players who reached each step, for farms from before 1.8 and for new farms at level 3), the head start, gifts and hearts per villager, gift reactions (loved / liked / disliked), how many players finish the daily villager visit, Ask a friend and mailbox activity, and **Send a letter to everyone** (with preview). |
| **Requests** | Ask a friend (1.8): open and filled requests, what friends sent and when Hazel stepped in. |
| **System & log** | Database size against the free plan, table sizes, scheduled jobs and failures, removing old empty accounts, and the admin log. |

## Needs: gifting what a player is missing

Player page > **Needs** (`admin/src/views/needs.ts`) reads the player's cloud save (Google players only) and lists
what they are working towards, each with progress and what is still missing:

- **Today's requests:** the order board, the delivery truck, the boat visitor, Help Wanted and Wren's field note.
- **Building projects:** every square room, Manor wing, Estate stage, woods trail, Elder Oak stage, treehouse piece
  and the Old Mine entrance not finished yet, bundle by bundle (wanted, put in, what they hold that counts, missing).
  Open ones come first; locked ones are folded under "Locked for now", with why (level, the Village Festival, or the
  stage before).
- **Next pickaxe** (Bram, the Old Mine), **Upgrades** (coins only: Farmhouse and buildings) and **Quests** (shown
  for status only: they count what the player does, so they cannot be gifted).

Missing items in open projects and today's requests start ticked; coins never do. Change numbers, tick or untick,
then **Gift selected**: one developer gift (`admin_give`), so it shows under Developer gifts on the Support tab and
on the Gifts page, and arrives the next time they open the game. Bundles that want silver or gold send starred items
(`silver__<item>` / `gold__<item>` keys, game 1.31.2 and later; older games cannot take them, so those rows are
greyed out). The save can be a little behind what they have on their phone, and an unopened developer gift is not in
it yet (the tab says so).

## Locking a player

On a player's page, **Lock account** (toolbar, Lock). Pick how long (1 hour to 30 days, a date and time of your choice, or no end date) and type the reason: the player sees exactly what the preview shows, a full-screen notice over the game with your reason, the end date and a live countdown. They cannot play while it shows, and the server refuses their gifts, market, help and likes, Ask a friend, Village Projects, farm sharing and reward codes. They are hidden from the leaderboards and put back when the lock ends (unless you had hidden them before). **Change lock** replaces it; **Unlock now** lifts it. The page header shows the lock with a countdown, the Support tab lists every lock they have had, and each lock and unlock is in the admin log. The game checks for a lock when it opens, every 5 minutes, and straight away when the server refuses something; the last known lock also shows offline and lifts by itself when its time runs out. Needs the `account locks` section of `supabase/schema.sql`.

## Reports

Players report another player from a player card, a gift in their mailbox or a farm visit (1.33, needed for the App
Store). Each report shows the reason, the reporter's note, where it was seen, and a copy of the reported player's name,
farm name and (for a gift) the gift's note as they were at the time. **Read every report within a day** (Apple asks
for this). To act: open the player (the name is a link), lock the account if needed (Locking a player), then mark the
report **Actioned**; otherwise **Dismiss** it. The player page's Support tab also lists reports about and by that
player and how many players block them. Players can block each other without a report; blocks are enforced on the
server. Needs the `reports and blocks` section of `supabase/schema.sql`.

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
- **Letters to everyone** (1.8, page 1.8 Village): write a title and a letter (a blank line starts a new paragraph),
  pick who gets it (everyone, played this week / 2 weeks / month, Google players), check the preview and send. It is
  queued for every matching player that exists now and lands in their in-game mailbox, signed by the Cozy Acres team,
  the next time the game checks for gifts (on opening and every 5 minutes). Each player gets it exactly once; the
  page shows how many have picked it up. It cannot be taken back, so read it twice. No long dashes, please: the game
  uses " - ".
- **Game events** (1.8): the game logs small named moments (`player_events`, at most 200 a day per player, kept 180
  days): `welcome_start`, `welcome_step` (step, variant), `welcome_gift`, `welcome_done`, `welcome_later`,
  `welcome_skip_gift`, `welcome_find`, `welcome_basket`, `headstart` (orders, points, hearts), `gift` (villager,
  taste, points, birthday), `hearts` (villager, hearts, reason), `visit` (villager), and from counters `help_ask`,
  `help_send`, `help_arrived`, `help_hazel`, `visit_give`, `find_collect`, `find_return`. Only with real online play
  (never in practice mode). The 1.8 Village page reads them; numbers start from the day 1.8.0 went live.
  1.8.5 adds `skill_level` (skill, level), `skill_perk` (skill, perk), `skills_headstart`, `bundle_done` (room, bundle,
  level) and `room_done` (room, level, rooms), read by the **1.8.5 Square** page: which rooms and bundles players
  finish, how far each skill has grown and which perks players pick. It needs the `1.8.5 skills and village
  restoration` section of `supabase/schema.sql` (run the whole file, it is safe to re-run). The game also reports
  `gpu_info`, `gpu_fallback`, `gpu_context_lost`, `gpu_context_back` and `gpu_blank_low` (1.8.1) when a phone's
  graphics need a fallback.
- **Daily backups** run at 03:17 UTC when pg_cron is enabled (System & log shows the job). Unchanged farms are skipped,
  backups are kept 60 days (the newest per player always).

## Privacy

The dashboard shows personal data (Google emails, feedback, play times, game events). Do not share screenshots of it or the
"Download everything" file. All of it is covered by the privacy policy and is deleted when a player deletes their
online account (everything is linked to the account with `on delete cascade`).
