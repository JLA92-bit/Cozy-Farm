# Handover from the Opus chat (7 Oct 2026)

Cozy Acres: mobile-first 3D cozy farming PWA (Three.js + TypeScript + Vite, Supabase online). Live at
https://cozyacres.joshmakesgames.app/play/. Pushing to `main` deploys (GitHub Actions "Deploy website and game",
`.github/workflows/deploy.yml`). Android TWA (`android/`, package `app.joshmakesgames.cozyacres`) is in Google Play
closed testing and loads the live site, so web deploys reach Play users without a new build.

## What this chat did (newest first)

- **1.8.0 "Village Friends"** (deployed, commit f906fd0). Built by 5 agents, merged on `integrate/v18` and tested together.
  - Villagers: six villagers (Rosa, Old Tom, Juniper, Pip, Hazel, Bram), Village button and screen, villager
    pages, gift picker, hearts 0-10, milestones (2 letter, 4/8 story + keepsake/portrait, 6 perk, 10 best friend),
    villagers walking the farm, orders signed by villagers.
    Files: `src/systems/Village.ts`, `VillageRewards.ts`, `Perks.ts`, `src/ui/panels/VillagePanel.ts`,
    `src/data/villagers.json`, `src/world/models/keepsakes.ts`.
  - Star quality: Normal/Silver/Gold per unit, `state.quality[item] = [silver, gold]`, normal items used first,
    fertiliser, star ingredients in workshops. Files: `src/systems/Quality.ts`, `src/ui/QualityUI.ts`.
  - Mail and daily rhythm: mailbox model, Mail screen, villager of the day, daily finds, weather, Book pages
    (Calendar, Letters, Village Guide). Files: `Mail.ts`, `Daily18.ts`, `Weather.ts`, `MailPanel.ts`, `BookPages18.ts`.
  - Ask a friend: requests, fills, Auto-help, Hazel fallback, Requests dashboard page. Files: `src/systems/Help.ts`,
    `src/online/AskHelp.ts`, `HelpPanel.ts`.
  - Welcome: 8-step welcome for old saves, head start, Founding Farmer sign, short intro for new farms at level 3,
    `logEvent`, letters to everyone, "1.8 Village" dashboard page. Files: `Welcome18.ts`, `Welcome18Panel.ts`,
    `src/online/Events.ts`, `src/world/models/FoundingSign.ts`.
  - Gifts from the developer are now checked whenever the game is reopened (`src/online/Activity.ts`).
- **1.7.0 Admin dashboard** at `/admin/` (separate Vite app in `admin/`, built by `scripts/pages/build.sh`). Google
  sign-in only, analytics, players, gifts (coins/gems/items/land) that arrive by themselves, codes, backups (daily
  pg_cron), feedback, market moderation, leaderboard hiding, notifications. See `ADMIN.md`.
- **1.6.1 / 1.6.2**: Settings > Load a farm (farm link or 8-character farm code), reward codes.
- Restored player Mel's lost farm (level 23) from screenshots. Done; she has her farm, apology gift and land.

## In progress / half done

Nothing. The working tree is clean and `main` = `integrate/v18` = `claude/admiring-gates-f3vtro`.

## Setup still needed outside the code

1. **Supabase (required for 1.8 online features):** run the whole `supabase/schema.sql` in the SQL Editor (safe
   to re-run), then `notify pgrst, 'reload schema';`. Until then Ask a friend, game events, letters to everyone
   and the "Requests" / "1.8 Village" dashboard pages do not work. Ask the user whether this has been done.
2. Android `android/twa-manifest.json` still says 1.6.0 / versionCode 4. A new Play build is only needed for
   native changes (the TWA loads the live site).

## Decisions and why

- No romance or marriage, ever (user's rule).
- Gift rules live only in `village.giveGift` (love 40, like 20, neutral 8, dislike -20, birthday x3, stars x1.25/x1.5).
- Quality must not break the economy: only the barn pays star prices; orders, truck, stall and market take normal
  items first at normal price (about +2% income). See `BALANCE.md`.
- Head start: `min(300, round(orders_completed * 15 / 6))` points per villager, reason `'headstart'`.
- Ask a friend: the asker's game passes its friend list (max 30); only those friends see requests. Claims are
  exactly-once; if a claim response is lost, those items are lost (same as gifts; chosen over double delivery).
- The friends side button says "Gifts" (not "Mail") so there are not two Mail buttons.
- Admin: `admin_users` is filled in SQL only; the admin email is never committed. Every admin function calls
  `admin_guard()` and logs to `admin_log`.
- Never push or deploy without the user's explicit OK. The user likes to see changes before they go live.

## Known rough edges (not fixed)

- Old players get six 2-heart tip letters at once on their first 1.8 boot (from the head start). Acceptable, but
  could be spread over days.
- The practice-mode demo neighbour "Old Tom" (`src/online/LocalBackend.ts`) shares a name with villager Old Tom.
- Mail's `src/world/VillagerLooks18.ts` and the welcome's own look table duplicate `villagers.json` `look`;
  `look` wins, so they are only fallbacks. Could be unified.
- `help_received` stat also counts older neighbour help, so the `help_arrived` event overcounts slightly.
- Playwright reports panel buttons as "not stable"; tests use `force: true` or DOM clicks.

## Ideas discussed, not started (1.8.5 and later)

Village Restoration (community bundles), Skills, new workshops and animals, level 20-50 map, village market day
(Saturdays, placeholder label only exists in the Calendar). The full design brief is the 1.8 Claude Doc:
https://claude.ai/code/artifact/e5fdf6a6-b0a8-4bb5-946d-58ca740c01c1

## Gotchas

- Checks before any push: `npx tsc --noEmit`, `npm run validate-data` (also checks changelog version = package.json
  version, villagers, guides), `bash scripts/pages/build.sh` (builds game, admin and website into `dist/`).
- Version bump: `package.json` + a new first entry in `src/data/changelog.json` (no em dashes in player text; the
  user wants "-" only).
- Save changes: every new state field must be optional or get a default and a repair rule in `Save.ts` `withDefaults`.
- `supabase/schema.sql` is one idempotent file; new server work is appended as a marked `-- ===== section =====`
  with grants like the others. Deleting an account must cascade (tables reference `profiles`/`auth.users`).
- Two keepsake model files: `models/keepsakes.ts` (villagers, `KEEPSAKE_PROC`) and `models/FoundingSign.ts`
  (`FOUNDING_PROC`). Do not create another file differing only by case.
- Gift codes are client-side and capped at 500 coins; bigger amounts use server reward codes or dashboard gifts.
- Debug in the browser: `window.__game`, `window.__ui`, `window.__scene`.
- Never put keys, the keystore or passwords in chat or the repo; never set ANDROID_CERT_SHA256 to a wrong value.
- Player data from Supabase is for support only and must not be shared.
