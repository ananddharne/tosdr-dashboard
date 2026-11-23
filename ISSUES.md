# Known issues

Running list of open problems. Add new ones as they're found; when one is fixed, move it to
**Fixed** with the date and commit. Newest first within each section.

## Open

### Direct check
- **Unreachable sites get the "refused" message** (2026-11-22). A site that doesn't exist (DNS
  failure) is reported as "refused our server's requests". Tell "couldn't reach" apart from
  "refused" using the recorded failure reason.
- **Page finder misses some policies** (2026-11-22): Reddit (policy is on redditinc.com, other
  domains aren't followed), Spotify and Garmin (short hub pages that link to the real policy),
  LibraryThing (no policy found).
- **Grades are approximate** (2026-11-22). Usually within one letter of ToS;DR, rarely exact; the
  model finds more "good" cases than ToS;DR's volunteers record (DuckDuckGo: ours B, theirs C).
  Open decision: keep showing the letter, or show only the quoted cases.
- **Slow**: a new check takes 1–2 minutes, plus up to a minute if the Render server was asleep.

### Data and state
- **Server cache is memory-only**: lost whenever Render restarts the server (free plan: after
  ~15 idle minutes), so repeat checks of the same site often cost again.
- **A page reload loses running checks**: the entry shows "Check didn't finish · tap to retry".
- **Saved apps live in one browser** (localStorage): nothing syncs across devices or people.

### UI
- **Possible right-edge cut-off on wide windows** (2026-11-22). In two user screenshots, "Remove
  from your apps" and "Try again" ran past the right edge. Not reproduced at 1400px (page width
  equals window, 16px margins both sides); both screenshots look cropped on the left too.

### Ops and cost
- **No spend cap** on the Gemini key yet. Set a budget in Google Cloud billing.
- **Server endpoints are public**: anyone can trigger paid checks; only a per-IP rate limit
  (10 checks/min) protects it. Add an access code before sharing the URL widely.
- **"Clause" design system page still has the old colours**; the app uses the muted Option B
  palette.

## Fixed
- 2026-11-22 `537f31b`: Flipkart's policies weren't found: its footer links are drawn by
  JavaScript, the standard guessed paths 404, and headless Chrome timed out on the heavy
  homepage. Added more guessed paths (/pages/privacypolicy, /pages/terms, Shopify's
  /policies/…, /privacypolicy, /privacy-notice, /terms-of-use…) and a 30s render wait.
- 2026-11-22 `647f33d`: apps ToS;DR lists without a grade (N/A, e.g. Flipkart) were treated
  as "already rated", with no way to grade them. Now offers "Check it directly"; graded matches
  also get "Not the right app? Check it directly".
- 2026-11-22 `12c5748`: ToS;DR lookup missed other spellings ("duck duck go"); it now also
  searches the website and the name without spaces, preferring services that list the site.
- 2026-11-22 `12c5748`: sites that block our server (duckduckgo.com from Render) now fall
  back to the Wayback Machine's latest copy, labelled as archived; failures record a reason
  ("HTTP 403", "timeout") in the response and server log; the "blocked" message no longer
  says the policy wasn't found. Verified on Render: DuckDuckGo reads via the archive.
- 2026-11-22 `4dc7e73`: checks you didn't add had no way back to the result; new checks now go
  straight into Your apps.
- 2026-11-22 `c4a1011`: page finder picked blogs, warranty PDFs and JavaScript-only stubs.
- 2026-11-22 `c4a1011`: policies cut off at 60k characters made grades much worse.
