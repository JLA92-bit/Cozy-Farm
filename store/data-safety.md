# Google Play Data safety form - Cozy Acres

Play Console > **App content** > **Data safety**. Answers derived from the code (`src/online/*`,
`supabase/schema.sql`, `src/systems/Save.ts`, `src/notify/Push.ts`) as of version 1.5.1. Re-check this file whenever online features change.

## How the app handles data (summary)

- The farm save lives on the device (browser/app storage, `localStorage`). It never leaves the device unless the player
  signs in with Google (cloud save).
- When the device is online, the game signs in to Supabase **anonymously in the background** (no email or password)
  and publishes a public profile so friends, gifts, the Shared Market and leaderboards work. This happens for every
  player who goes online; there is no switch to turn it off, so the data below is marked **required** unless noted.
- **Sign in with Google is optional.** It links Google to the anonymous account and turns on the cloud save.
- **Farm visits** (from 1.4): a public snapshot of the farm layout (fields and crop stages, buildings, animals,
  trees, decorations, plus farmer name, level and look) so neighbours can visit. No coins, items or other save data.
- **Neighbour help** (from 1.5): helping a neighbour's farm (water, feed, tend) and likes, with an optional guestbook
  note picked from a **preset list** (no free text).
- **Phone notifications are optional** (from 1.5, off until the player switches them on): the device's push
  subscription (push service address and keys), its time zone, quiet hours and choices, and the reminder texts
  queued for the next day.
- No ads and no in-app purchases yet (when either is added, use the ready-made additions in `store/monetisation.md`), no analytics, no crash reporting SDK, no location, no contacts, no advertising ID or hardware IDs.
- Backend: Supabase (database and auth). Website and game files: GitHub Pages. Sign-in: Google. These are service
  providers acting for us, which Play does not count as "sharing".
- All traffic is HTTPS.
- In-app deletion: Settings > Online play > **Delete my online account** (calls `delete_my_account()`, which removes
  the auth user, profile, friend code, cloud save, farm snapshot, the player's market listings, all gifts they sent or
  received, neighbour help and likes in both directions, push subscriptions and queued notifications; checked on
  Postgres on 5 October 2026).

## Section 1: Data collection and security

| Question | Answer |
| --- | --- |
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes** (HTTPS to Supabase, Google and GitHub Pages) |
| Do you provide a way for users to request that their data is deleted? | **Yes**: in the app (Settings > Online play > Delete my online account) and by email; web link `https://cozyacres.joshmakesgames.app/delete-my-data/` |

## Section 2: Data types

Mark these as **collected**. Mark **none as shared** (see the note on sharing below). "Processed ephemerally" = **No**
for all of them (they are stored).

### Personal info

| Data type | Collected | Required or optional | Purposes | What it is in the app |
| --- | --- | --- | --- | --- |
| **Name** | Yes | Required | App functionality, Account management | The farmer name the player types (shown on leaderboards, gifts and market listings) and, only for Google sign-in, the name Google provides. It can be any nickname. |
| **Email address** | Yes | **Optional** | Account management | Only when the player chooses Sign in with Google (stored by Supabase Auth). Never shown to other players, never used for email. |
| **User IDs** | Yes | Required | App functionality, Account management | Anonymous Supabase account id, the public friend code (e.g. `KX4-92P`) and, with Google sign-in, the Google account id. |
| Address, phone number, race, religion, sexual orientation, other info | No | | | |

### Financial info, Health and fitness, Messages (email/SMS), Photos and videos, Audio, Files and docs, Calendar, Contacts, Location, Web browsing

All **No**. (Gift notes are in-app user content, declared under App activity below, not as "Messages", which Play
defines as emails, SMS and other in-app messages; if a reviewer asks, the notes can also be declared as
"Other in-app messages", required, App functionality.)

### App activity

| Data type | Collected | Required or optional | Purposes | What it is in the app |
| --- | --- | --- | --- | --- |
| **Other user-generated content** | Yes | Required | App functionality | Farm name, gift notes (max 140 characters), the farm snapshot neighbours see when visiting, guestbook notes (preset list) and, for Google sign-in, the cloud save (a copy of the whole farm). |
| **Other actions** | Yes | Required | App functionality | Game progress published for leaderboards and friends (level, total XP, farm value, Charm, weekly XP, farmer look), gifts sent and claimed, market listings, sales and purchases, neighbour help (water, feed, tend) and likes. |
| App interactions, In-app search history, Installed apps | No | | | The game does not record taps, searches or other apps. |

### App info and performance

| Data type | Collected | Notes |
| --- | --- | --- |
| Crash logs | No | No crash reporting. |
| Diagnostics | No | No analytics or performance monitoring. |
| Other app performance data | No | |

### Device or other IDs

| Data type | Collected | Required or optional | Purposes | What it is in the app |
| --- | --- | --- | --- | --- |
| **Device or other IDs** | Yes | **Optional** | App functionality | Only when the player switches on notifications: the device's push subscription (the address at its push service and the keys to send to it). Deleted when notifications are switched off or the account is deleted. |

The cloud save also stores a generic device label such as "Android phone" (from the browser user agent) so the
player can recognise their farm; that is not an identifier. The device time zone stored with notifications is used
only for quiet hours and is not declared as Location (it is not a location from GPS or IP).

### Purposes not used

Not used for: Analytics, Developer communications (notifications are only game reminders the player chose, such as
"Wheat is ready", which is App functionality), Advertising or marketing, Fraud prevention/security/compliance
(beyond the server checks that are part of app functionality), Personalisation.

## Note on "sharing"

Play counts as sharing only transfers to third parties. Not sharing:
- Service providers (Supabase, Google sign-in, GitHub Pages) processing data on our behalf.
- Data the player knowingly makes public as part of the game: their farmer name, look, level and scores on
  leaderboards, their name on gifts and market listings. Play's guidance exempts user-initiated transfers the user
  reasonably expects, and the privacy policy explains it. If you prefer to be extra cautious you may declare
  Name, User IDs (friend code) and Other actions as "shared" for "App functionality"; it does not change the review.

Server logs: Supabase and GitHub Pages keep short-lived request logs that include IP addresses for operating and
securing the service. They are not used to derive location or to track players, so no Location data type is declared.

## Section 3: Account creation and deletion (part of the Data safety form)

| Question | Answer |
| --- | --- |
| Does your app allow users to create an account? | **Yes**: "My app allows users to create an account" (anonymous account created automatically, optional Google sign-in) |
| Login methods | Username and other authentication (anonymous) and OAuth (Sign in with Google) |
| Delete account URL | `https://cozyacres.joshmakesgames.app/delete-my-data/` |
| Can users request that some or all of their data is deleted without deleting their account? | Not separately; deleting the online account deletes all server data. The farm on the device can be reset in Settings (Reset) or by uninstalling. Answer "No". |

## Section 4: Security practices

- Data encrypted in transit: Yes.
- Users can request deletion: Yes.
- Committed to follow the Play Families Policy: No (the app is not for children; target audience 13+).
- Independent security review (MASA): No.
