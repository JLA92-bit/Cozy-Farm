# Closed test kit - Cozy Acres

Google requires new personal developer accounts to run a **closed test with at least 12 testers who stay opted in
for 14 days in a row** before the app can go public. This file has everything for that: the tester list setup,
the invite to send, and what to ask testers to try. Log what happens in `store/test-log.md`.

## 1. Make the tester list (a Google Group, 5 minutes)

A Google Group lets testers join themselves, so you never type their emails into Play Console.

1. Go to <https://groups.google.com>, sign in with `joshmakesgames92@gmail.com`, **Create group**.
2. Name `Cozy Acres testers`, group email e.g. `cozy-acres-testers@googlegroups.com`.
3. Privacy: **Who can search for group**: "Only members"; **Who can join**: "Anyone on the web can ask" (you approve
   each request) or "Anyone can join" (easiest). **Who can view conversations / post**: "Group managers" (it is a
   list, not a chat).
4. Create. Copy the group's link (`https://groups.google.com/g/cozy-acres-testers`).

## 2. Connect it to Play Console

1. Play Console > Cozy Acres > **Test and release > Testing > Closed testing** > **Create track** (or use
   "Closed testing - Alpha"), name it `Friends and family`.
2. **Testers** tab > **Google Groups** > add the group email > Save.
3. **Feedback URL or email address**: `joshmakesgames92@gmail.com`.
4. **Countries / regions**: pick every country your testers live in (or all).
5. Create a release on this track with the first `app-release-bundle.aab` (store/checklist.md section 5) and send
   it for review. The first review can take a few days.
6. Once the release is approved, the **Testers** tab shows the **opt-in link** (`https://play.google.com/apps/testing/app.joshmakesgames.cozyacres`). That is the link testers need.

The 14 days start counting when at least 12 testers have opted in. Invite **15 to 20 people** so a few drop-outs
do not reset the clock. Check the count any time on the Closed testing page.

## 3. Who can test

- Anyone with an **Android phone or tablet** and a **Google account** (the one signed in to the Play Store).
- iPhone users cannot join (they can play the web version at <https://cozyacres.joshmakesgames.app/play/>, but that
  does not count for Google).
- Good testers: friends, family, colleagues, people from a game or parenting group, or other indie developers
  (developer communities often swap testing). Aged 13 or over, as the game's online features are for 13+.

## 4. The invite (copy, fill in the two links, send)

Short version for a text or WhatsApp:

```
Hi! I've made a little farming game for phones called Cozy Acres and I need Android testers before it can go on
the Play Store. Could you help? It takes 2 minutes to set up:

1. Join the tester group: [GROUP LINK]
2. Open this link on your Android phone and tap "Become a tester": [OPT-IN LINK]
3. Install Cozy Acres from the Play Store page it shows you

Then just play now and then, and please keep it installed for 2 weeks (Google counts the days). Any thoughts,
bugs or ideas: reply here or email joshmakesgames92@gmail.com. Thank you!
```

Longer version for email:

```
Subject: Can you help test my farming game for 2 weeks?

Hi [name],

I've been making a cozy farming game called Cozy Acres, and it's almost ready for the Google Play Store. Before
Google lets a new developer publish, 12 people have to test the game for 14 days - would you be one of them?

What you need: an Android phone or tablet, and the Google account you use for the Play Store.

How to join (about 2 minutes):
1. Join the tester group: [GROUP LINK]
2. On your Android phone, open [OPT-IN LINK] and tap "Become a tester".
3. Tap the link to the Play Store on that page and install Cozy Acres.
   (If the Play Store says the app isn't available, wait a few minutes after step 2 and try again.)

What I'd love you to do:
- Play a few times over the two weeks - even 5 minutes is great
- Keep the game installed and stay in the tester group for the whole 14 days (Google counts the days)
- Tell me anything: bugs, things that confused you, what you enjoyed, what you'd add

Things to try if you're curious:
- Plant and swipe-harvest your fields, raise animals and fill a delivery order
- Go fishing at the dock (it unlocks at level 7)
- Add me as a friend with my friend code [YOUR FRIEND CODE], visit my farm and help it out
- Switch on phone reminders in Settings > Notifications

Your farm is saved on your phone. Signing in with Google in Settings is optional and backs it up.

Reply to this email or write to joshmakesgames92@gmail.com with anything at all. Thank you so much!

Josh
Josh Makes Games
```

## 5. During the test

- **Day 1-2:** check the opt-in count on the Closed testing page; nudge anyone who has not installed yet.
- **Day 4 and day 10:** send a short message ("How's the farm going? Anything annoying or confusing?"). Replies
  are the feedback Google asks about.
- Fix what testers find. Game fixes go live by deploying the website as usual (no new upload). Only changes to
  the Android app itself (name, icon, notifications setting) need a new bundle with a higher versionCode.
- Write every piece of feedback and every fix in `store/test-log.md` as it happens.
- **Day 15 or later**, with 12+ testers still opted in: Dashboard > **Apply for production** (draft answers are in
  `store/test-log.md`).

Testers who leave the group or uninstall stop counting. If the count drops below 12, the 14 days restart when it is
back to 12, so keep a few spare testers.
