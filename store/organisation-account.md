# Moving to a Google Play organisation account (Australia)

Status (25 Oct 2026): Google turned down production access ("app requires more testing"). The account is a
personal account created after 13 Nov 2023, so it needs 12+ testers opted in for 14 days in a row. Organisation
accounts are not asked for that test. This is the plan to move to one. Fees are 2026-27 (ASIC indexes them every
1 July), in AUD unless marked.

**First, for free:** ask Play Console support (Help > Contact support) in writing whether converting this account to
an organisation, or transferring `app.joshmakesgames.cozyacres` to a new organisation account, removes the closed
testing requirement. Google has not said so clearly, and a Google Play Product Expert has said a transferred app can
keep it. The answer decides between routes A/B and C below.

## Steps

1. **Pick the legal entity.**
   - **Company (Pty Ltd), the sure route.** Get a Director ID first (free, abrs.gov.au, needs myGovID). Register
     with ASIC: $636. Then an ABN for the company (free). Annual review: $342 a year. Company tax return each year.
   - **Sole trader with a registered business name, cheaper but uncertain.** ABN (free) and a business name with
     ASIC ($47 for 1 year or $108 for 3 years). Equifax (Dun & Bradstreet's Australian partner) can issue a
     D-U-N-S to a sole trader, but it is not clear Google accepts a sole trader as an organisation. Ask support
     before relying on it.
2. **D-U-N-S number (free).** From Equifax / Dun & Bradstreet. About 2-3 weeks after ASIC registers a company, about
   30 days for a sole trader. Never pay for one. The name, ABN/ACN and address must match ASIC exactly (mismatches are
   the usual reason Google's verification fails).
3. **Website (free, joshmakesgames.app).** Google verifies the organisation's website. Show the legal name and the
   ABN/ACN in the footer and the privacy policy (Claude can add these).
4. **Google Play.**
   - **A. Convert this account (free):** Play Console > Developer account > About you: verify the website, then
     Change account type, with a new organisation payments profile and the D-U-N-S. App, package name, signing keys
     and testers stay.
   - **B. New organisation account (US$25, about A$40) + app transfer (free):** package name and app signing key move
     with the app, so the TWA and `assetlinks.json` stay the same. Testers opt in again.
   - **C. New organisation account + a new listing (US$25):** the only sure way past the test, but a new package name:
     new TWA build (`android/`), new `ANDROID_PACKAGE`, `assetlinks.json` for both, website links. Only if support says
     A and B keep the requirement.
5. **Google's organisation check:** a few days, up to 2-4 weeks. Then apply for production access.

## Costs

| | Pty Ltd | Sole trader + business name |
| --- | --- | --- |
| Set-up | $636 ASIC + Director ID, ABN, D-U-N-S free | $47 (1 yr) or $108 (3 yrs) + ABN, D-U-N-S free |
| Google Play | A: $0, B or C: US$25 (about A$40) | same |
| Every year | $342 ASIC review + company tax return (about $1,000-2,500 with an accountant, estimate) | business name renewal + your own tax return |
| GST | only if turnover reaches $75,000 a year | same |

Privacy Act: small businesses under $3M turnover are usually exempt, and there is no registration fee (the privacy
policy stays as it is). Free business bank accounts exist.

Timeline: about 3-6 weeks, mostly the D-U-N-S and Google's check. The free alternative is a second closed test (12+
testers playing every day for 14 days, about 2 weeks).
