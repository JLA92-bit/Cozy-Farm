# App Store listing - Cozy Acres (iPhone)

Everything to paste into **App Store Connect** for the iPhone app (`ios/README.md` has the build and upload steps).
Character counts were checked; Apple's limits are in brackets. The Google Play listing is `store/listing.md`.

## Before you start (owner)

1. Apple Developer Program active, then App Store Connect > **Business**: accept the **Free Apps** agreement (paid apps
   and in-app purchases need the Paid Apps agreement, tax and bank details later).
2. App Store Connect > Apps > **+ New App**: platform iOS, name `Cozy Acres`, primary language English (Australia or
   U.S.), bundle ID `app.joshmakesgames.cozyacres` (appears once the App ID exists; Xcode makes it on the first
   archive with automatic signing), SKU `cozyacres-ios`, user access Full Access.
3. **EU trader status** (Digital Services Act; App Store Connect asks before the app can be offered in the EU): as a
   sole trader making the game as a business you are a trader, and your name, address, phone and email are then
   shown on the EU store page. If you would rather not yet, leave the EU countries out under Pricing and
   Availability for the first release and add them later.

## App information

| Field | Value |
| --- | --- |
| Name (30) | `Cozy Acres` (10) |
| Subtitle (30) | `Farm, fish and make friends` (27) |
| Category | Primary **Games**, subcategories **Simulation** and **Casual** |
| Content rights | No third-party content that needs rights (the art is CC0 or MIT, see `CREDITS.md`) |
| Age rating | See "Age rating" below (aim: **13+**) |
| Copyright | `2026 Josh Makes Games` |
| Privacy Policy URL | `https://cozyacres.joshmakesgames.app/privacy/` |
| Support URL | `https://cozyacres.joshmakesgames.app/support/` |
| Marketing URL (optional) | `https://cozyacres.joshmakesgames.app/` |
| Price | Free (Tier 0) |

**Promotional text** (170, can be changed any time without a new build):

```
New: the Old Mine! Take the lift down 60 floors across the water, find gems and fossils for the Museum, and help Bram's crew bring the old workings back to life.
```

(161)

**Keywords** (100, commas, no spaces after commas, do not repeat the name or the category):

```
farming,farm,village,harvest,cozy,relaxing,fishing,crops,animals,decorate,builder,friends,garden
```

(96)

**Description** (4000):

```
Welcome to Cozy Acres, a gentle 3D farming game you play at your own pace. Plant your fields, swipe to harvest, raise happy animals and turn a little patch of land into the cozy village of your dreams.

Free to play, no ads, and every coin and gem can be earned just by playing.

GROW YOUR FARM
- Plant dozens of crops, from wheat and carrots to tea, roses and giant pumpkins
- Swipe across your fields to plant or harvest lots at once
- Grow apple, cherry, peach, olive and other fruit trees
- Clear the wild land and watch your farm spread across the island

RAISE ANIMALS
- Look after chickens, cows, sheep, pigs, goats and bunnies
- Name your animals, give them a pat and keep them happy and healthy

MAKE TASTY GOODS
- Run a bakery, dairy, jam kitchen, tea house, florist and many more workshops
- Bake pies, churn cheese, brew tea and fill orders for the village
- Hire farmhands to help with the chores

MEET THE VILLAGE
- Make friends with six villagers, each with their own story, favourite gifts and letters
- Restore the village square, the old manor, the clock tower and the lighthouse
- Celebrate a festival every week: Egg Hunt, Fishing Derby, Harvest Fair and Feast of Lights

EXPLORE
- Forage the Wild Woods, feed the woodland critters and build a treehouse
- Take the lift down 60 floors of the Old Mine and fill the Museum with your finds
- Cast a line from the dock and the pier and catch dozens of fish

MAKE IT HOME
- Decorate your farm with flowerbeds, lanterns, fountains and more
- Step inside your Farmhouse and furnish every room, then take photos and hang them on the wall

PLAY WITH FRIENDS (optional)
- Add friends with a friend code, send gifts and visit each other's farms and homes
- Help with Village Projects together and trade on the Shared Market
- Climb the leaderboards
- Report or block any player, any time

ALWAYS SOMETHING TO DO
- No top level: there is always another level and more to unlock
- Daily rewards, quests, awards, the Master Board and a Collection Book to fill
- Sign in to back up your farm and keep playing on other devices

Made by Josh Makes Games, a tiny indie studio. Questions or ideas? Email joshmakesgames92@gmail.com - we read every message.
```

(2,206 characters)

## Version information (each release)

**What's New in This Version** (4000): the highlights of the newest release in `src/data/changelog.json` (the game's
own What's new). First release:

```
Welcome to Cozy Acres on iPhone! Grow, fish, explore the woods and the Old Mine, decorate your home and play with friends.
```

**App Review Information:**

- Sign-in required: **No** (the game starts at once; online play uses an automatic background account, signing in with
  Apple or Google is optional and only backs up the farm).
- Contact: your name, phone and `joshmakesgames92@gmail.com`.
- Notes:

```
Cozy Acres is a single-player farming game with optional online features (friends, gifts, farm visits, a shared market, leaderboards). No login is needed: the game makes an anonymous online account in the background. Sign in with Apple or Google is optional and only backs up the farm (Settings > Online play).

Players can choose a farmer name, farm name, short gift notes, sign text and room names. These pass a word filter in the game and on our server. Any player can be reported or blocked from their player card (tap a name on the Leaders board or in Friends), from a gift in the mailbox, or while visiting their farm. Reports reach our dashboard and are reviewed within 24 hours. Blocked players stop seeing each other's gifts, farms, homes and market listings. Accounts can be deleted in Settings > Online play > Delete my online account.

There are no ads, no in-app purchases and no loot boxes.
```

## Age rating

App Store Connect > the app > App Information > Age Rating > Edit. Answer honestly; the result should be 13+ (if the
questionnaire gives a lower age, choose **13+** anyway: friends features carry player-written names and short notes).

| Question | Answer |
| --- | --- |
| Cartoon or fantasy violence | None |
| Realistic violence, prolonged graphic violence | None |
| Profanity or crude humour | None |
| Mature or suggestive themes, sexual content or nudity | None |
| Horror or fear themes | None |
| Medical or treatment information | None |
| Alcohol, tobacco or drug use or references | None |
| Simulated gambling | None (no loot boxes, mystery crates are earned in play and cannot be bought) |
| Contests | None |
| Unrestricted web access | No |
| User-generated content | **Yes** (names, farm names, short gift notes, signs, room names; filtered, reportable, blockable) |
| Messaging and chat | **Yes**, limited: short gift notes between friends (no open chat) |
| Advertising | No |
| Parental controls, age assurance | No |

## App Privacy (the "nutrition label")

App Store Connect > the app > App Privacy > Get Started. From `store/data-safety.md`. **Tracking: No** (no data is
used to track players across other companies' apps or websites, no advertising ID, no third-party analytics).

| Data type | Collected | Linked to the player | Tracking | Purposes |
| --- | --- | --- | --- | --- |
| Contact Info > **Email Address** | Yes (only if they sign in with Apple or Google) | Yes | No | App Functionality |
| Identifiers > **User ID** | Yes (the online account id and friend code) | Yes | No | App Functionality |
| User Content > **Other User Content** | Yes (farmer and farm names, gift notes, signs, room names, the shared farm and home, in-game photos, reports) | Yes | No | App Functionality |
| User Content > **Customer Support** | Yes (Settings > Send feedback, optional) | Yes | No | App Functionality |
| Usage Data > **Product Interaction** | Yes (days played, minutes, game events) | Yes | No | Analytics |
| Diagnostics > **Other Diagnostic Data** | Yes (device and version with feedback, graphics fallbacks) | Yes | No | App Functionality |
| Location, Contacts, Health, Financial Info, Browsing History, Search History, Sensitive Info, Purchases, Photos or Videos (from the phone), Audio, Advertising Data | No | | | |

Notes: the in-game photos are pictures of the game made in Photo mode, never from the phone's camera or library, so
they count as Other User Content, not Photos. The cloud save (a copy of the farm) is Other User Content too.

## Export compliance

Already answered in the app (`ITSAppUsesNonExemptEncryption` = false in `ios/App/App/Info.plist`): the app uses only
standard HTTPS, so App Store Connect does not ask on each upload.

## Screenshots

6.9-inch iPhone, **1320 x 2868** portrait (or 2868 x 1320 landscape), PNG or JPEG, 1 to 10. Apple scales them for the
smaller iPhones. Files: `store/screenshots/ios-*.png`, 1320 x 2868, made from the real game at the 6.9-inch iPhone
size with its notch and home bar spacing (a level 45 showcase farm from the demo farm generator; practice-mode labels
hidden, as for the Play screenshots). Order:

1. `ios-01-farm.png` - the farm
2. `ios-02-village.png` - the village and its villagers
3. `ios-03-home.png` - inside the Farmhouse
4. `ios-04-friends.png` - friends asking for a hand
5. `ios-05-leaders.png` - leaderboards

No iPad screenshots are needed (the app is iPhone only for now).

## After the first upload

TestFlight first (`ios/README.md`), then App Store Connect > the app > the version > add the build > **Add for
Review** > Submit. Review usually takes a day or two. Release: automatically, or manually when you press Release.
