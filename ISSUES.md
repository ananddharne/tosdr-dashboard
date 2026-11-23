# Known issues

Running list of open problems. Add new ones as they're found; when one is fixed, move it to
**Fixed** with the date and commit. Newest first within each section.

## Open

### Direct check
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
- **Possible right-edge cut-off on wide windows** (2026-11-22). In a user screenshot, "Remove
  from your apps" and the "Try again" button ran past the right edge. Not yet reproduced; may be
  screenshot cropping.

### Ops and cost
- **No spend cap** on the Gemini key yet. Set a budget in Google Cloud billing.
- **Server endpoints are public**: anyone can trigger paid checks; only a per-IP rate limit
  (10 checks/min) protects it. Add an access code before sharing the URL widely.
- **"Clause" design system page still has the old colours**; the app uses the muted Option B
  palette.

## Fixed
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
