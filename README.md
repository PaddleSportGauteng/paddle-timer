# Paddle Timer

Local-network race day app for canoe sprint regattas. Runs off one laptop at
race control — no internet required, everyone connects over the venue wifi.

## Running it

You need [Node.js](https://nodejs.org) installed on the laptop that will act
as race control (the free "LTS" version, any recent one is fine).

```
cd paddle-timer
npm install      # first time only
npm start
```

You'll see something like:

```
Paddle Timer running.
  On this laptop:  http://localhost:4000
  On the network:  http://192.168.1.42:4000   <-- open this on phones/tablets
```

Open the **"On the network"** address on every phone/tablet/laptop that's on
the same wifi. Each device picks its own role from the home screen: Race
Office, Race Program, Tower, Weigh Station, or Results.

If a device can't reach it: check it's on the *same* wifi network as the
race control laptop (not mobile data), and that the laptop's firewall isn't
blocking incoming connections on port 4000.

## What's working right now (tested against your real entries sheet)

- **Meets** — a "PSA Sprint 2026", "Trilogy Series 2026 #1" style picker at
  the top-right of every page. Each meet's entries/events/races are
  completely separate — this is your historical database. Every device
  remembers its own last-picked meet.
- **Venue lane count is real, not assumed** — set when you create a meet
  (defaults to 9, the ICF standard, but any venue size works). Every heat
  split, straight-final threshold, and lane draw uses the actual number.
  Honesty note: ICF Appendix 1's exact semi/final qualifier tables only
  exist for a 9-lane course — that's what the published document defines.
  At any other lane count, heats still draw correctly, but semi/final
  advancement automatically falls back to manual review in Race Program
  (same tool used for oversized fields) rather than pretending to apply an
  ICF table that doesn't exist for that lane count. Verified: an 8-boat
  event at a 7-lane venue correctly split into 2 heats and flagged
  itself as needing manual advancement; a 20-boat event correctly split
  into 3 heats of 7 and the manual tool correctly suggested exactly 7
  qualifiers (not 9) for the semi.
- **Entries import** — upload the "System Race data" export into the
  selected meet, groups crews into events by distance/boat class/age
  category/gender.
- **Race Program** — the central editing page. Draw heats/finals per event,
  then every race across the whole meet shows as one numbered list ("Race
  1", "Race 2"...) labelled with its event, so it's unambiguous who's racing
  when. From here you can, right up until you finalise:
  - Reassign any lane to a different boat, or empty it
  - Scratch a boat out of just one race
  - Delete a whole race to redraw it
  - Merge under-full heats together (refuses if it would exceed 9 lanes)
  - Set or auto-generate start times (first time + interval, in race order)
- **Automatic heat → semi → final advancement** — the real ICF Appendix 1
  progression. The instant every heat for an event finishes, the correct
  number of semifinals is created automatically (direct-to-final qualifiers
  handled per-heat for fairness, the rest seeded into semis). The instant
  semis finish, the correct number of named finals (A, and B/C if the field
  is big enough per ICF 5.1.4) is created automatically too. Verified
  against real entries: a 10-boat field (2 heats, 3 direct qualifiers each,
  1 semi, 1 final) and a 20-boat field (3 heats, 1 direct qualifier each,
  2 semis, Final A + Final B) both produced exactly the composition ICF's
  tables specify. Fields bigger than ICF's published tables (>72 boats, >8
  heats) fall back to a manual review-and-select tool.
- **Finalise → Tower** — races stay invisible to the Tower until you hit
  Finalise. Before that, edit freely; after, the Tower shows them in race
  order, labelled with event/age group/start time.
- **Tower** — tap-lane-to-finish timing, supports several races running
  concurrently.
- **Weigh station** — log a weight after a boat finishes, auto-DQ against
  ICF/PSA minimums, results recalculate immediately, DQ'd boats shown
  separately with their reason (never hidden).
- **PSA medal-minimum flagging** — a category with fewer than 3 boats shows
  no medals but keeps its full results; 3–4 boats shows Gold only.
- **PDF programme export** — every race, lanes, names, clubs, start times,
  scoped to the selected meet.
- **Live Board (`/board.html`)** — a public, read-only page for athletes and
  spectators. No login, no edit controls, just: search your name/club/event,
  see your heat/semi/final and lane or bib number, and once a race
  finishes, the result appears right there. Replaces the old
  screenshot-and-send workflow — athletes check their own phone on the
  venue wifi instead. Only shows races that have been Finalised (same gate
  as the Tower); tested end-to-end: invisible before finalise, appears the
  instant it's published, updates with results the instant a race
  finishes. Deliberately has no password/PIN — same trust model as the
  rest of the app (anyone on the venue wifi), just no edit controls at all
  on this page regardless.
- **Provisional vs official results** — a race is "provisional" the
  instant it finishes (weigh-ins might still change something), until the
  office clicks "Mark official" in Race Program. The Board shows this
  distinctly (orange "Provisional" vs green "Official result"). A late
  weigh-in DQ automatically reverts an already-confirmed race back to
  provisional, so a stale "official" badge never sits on top of a result
  that just changed. Tested end-to-end.
- **Mass-start races (2000m/5000m)** — bib numbers instead of lanes. Assign
  bibs to a group of entries starting from any number you choose (so you
  can leave a gap between age-group blocks, e.g. U8-U12 from 20, everyone
  else from 70), set the lap count, and the Tower switches to a bib-entry
  pad: type/tap a bib each time it passes the counting point. Auto-finishes
  a boat the instant it completes its laps, with a live sheet showing every
  boat's lap count and each lap's time — so you can confirm at the end who
  actually completed the full distance. Reuses the same results/medal/PDF
  pipeline as lane races. Tested end-to-end against real 2000m entries.
- **Combined starts with split results** — e.g. "MIXED U10-U12 GUPPY,"
  common at Provincial level (PSA 1.2.1/1.2.2). Pick 2+ events that share a
  start — either a mass-start pool (bibs assigned per event first, so you
  keep separate number blocks) or a small combined lane final (must fit in
  9 lanes total). Everyone races together physically, but results, medal
  counts, and PSA minimums are computed separately per original age-group
  event. Verified against real data: a combined 16-boat U10+U12 mass start
  and a combined 4-boat lane final both correctly split into per-category
  standings with independent medal-minimum checks.

## What's NOT built yet — next steps

1. **Exact ICF lane-seeding within a round.** Advancement itself (who
   qualifies, how many semis/finals) now automatically follows the real
   ICF Appendix 1 tables (Plans A-G, verified against the 2025 rulebook
   for 2-8 heats / up to 72 boats) — this is no longer an approximation.
   What's still a stand-in: the exact LANE NUMBER each qualifier gets
   within their semi/final (ICF specifies this precisely; we use a
   reasonable centre-out draw + snake seeding across semis instead).
2. **K1/Guppy disambiguation** — when an event name is "500M K1 & GUPPY",
   the importer can't tell which individual boats are Guppy class from the
   sheet alone. Flagged on import; needs either a real data source or a
   manual confirm step.
3. **Combined starts are all-or-nothing straight finals for lane events**
   — a combined field needing heats (>9 boats combined) isn't supported,
   only mass-start pools and small combined finals.

## Project layout

```
server.js                — entry point
src/db.js                 — data storage (plain JSON file, data/db.json)
src/rules.js                — ICF + PSA rules: formats, medals, weight DQ
src/present.js                 — shared race data shaping (lanes -> names/clubs)
src/routes/meets.js               — the historical database of competitions
src/routes/entries.js              — spreadsheet import, scoped to a meet
src/routes/programme.js             — events, draw generation, race list, start times, finalise
src/routes/races.js                  — tower clock, lane finish capture, weigh-in, lane editing
src/routes/export.js                  — PDF programme export
src/routes/results.js                  — standings + medal eligibility
public/                                  — the five device pages (plain HTML/JS, no build step)
public/common.js                          — shared meet picker used by every page
```

Data lives in `data/db.json` — back this up regularly. Everything is scoped
by meet now, so you can safely keep importing new events without wiping old
ones; just create a new meet for each competition.

## What changed in this update

- **Race Office**: removed the Scratch/un-scratch section (unused workflow).
- **PDF caching bug fixed** — the browser could serve a stale cached PDF
  after regenerating start times. Server now sends no-cache headers, and
  the download button always requests a fresh copy.
- **Real bug found and fixed**: combined-race events were being silently
  dropped from the PDF (2 of 3 events in a combined group didn't show at
  all) because the PDF used strict event-ID matching instead of the
  combined-race-aware lookup used everywhere else. Fixed and verified.
- **Tower rebuilt**: every active race now shows stacked on the page
  simultaneously — no more tab-switching. Also rebuilt the re-render logic
  to only touch a race's card when its data actually changed (previously
  the whole page rebuilt every 1.5s, which could eat a click mid-render —
  the likely cause of "can't stop the clock" reports). Every action
  (start/finish/lane-tap/lap-pass) now has visible error handling instead
  of failing silently.
- **Weigh Station rebuilt**: Tower-style — tap a boat from a race card
  instead of typing a name to search. Shows a pass/DQ badge on anyone
  already weighed.
- **Race Program reordered**: Combine (now section 1) comes before Draw
  (section 2), matching the real workflow — check what needs combining
  first, then draw everything else.
- **Combined events consolidate into one row** everywhere (events table,
  PDF, Board) instead of showing/duplicating each original small category.
  Combined groups can have a custom label (e.g. "2000m U8-U12") or fall
  back to an auto-generated one.
- **Confirm / Change workflow**: a drawn event shows Confirm (marks it
  reviewed) or Change (undoes the draw, including un-combining, so it can
  be redone).
- **"Race anyway" override** for categories stuck below the ICF minimum
  with no combine partner — races them regardless, flagged as
  OVERRIDDEN everywhere (Race Program, PDF) so it's never mistaken for an
  oversight.

## What changed in this update (round 2)

- **Real bug fixed**: combining a mass-start group required a separate
  per-event bib-assignment step first, with no clear indication it hadn't
  happened — the combined race would just silently fail to create, leaving
  the small events looking un-combined ("the red flag won't clear"). Fixed:
  slide numbers (renamed from "bib" per your terminology) are now assigned
  in one step, pooled across the whole combined group, as part of the
  combine action itself.
- **Race Sort is now its own page**, separate from Race Program — combine
  age groups there first, then head to Race Program to draw everything
  else, set times, and finalise. A link/button connects the two both ways.
- **Quick fixes without a full redraw**: renumber a slide or edit a lap
  count directly in Race Program's detailed race list, the same way lane
  numbers are already editable. "Change" (grouping) still goes back to
  Race Sort — that's the only case that needs a full undo.
- **Slide numbers, not bib numbers** — renamed throughout (Tower, Weigh
  Station, Race Program, Board, PDF).
- Verified the whole chain end-to-end together: Race Sort → Race Program
  draw/confirm → start times → concurrent Tower races → finish → PDF,
  including override-flagged and combined events all showing correctly
  with no duplication.

## What changed in this update (round 3)

- **Race Sort summary view** — a table showing every event, combined or
  not, with boat counts, flagging anything that exceeds the venue's lanes
  before you head to Race Program.
- **Confirmed heat/semi splitting is already even** (differs by at most 1
  boat) — tested with 20 entries/3 heats (7/7/6) and 17 qualifiers/2 semis
  (9/8). Not a bug.
- **Rest-aware auto-scheduling** — semis/finals created automatically now
  get a start time based on the REAL finish time of the heats/semis that
  fed them, plus a configurable minimum rest gap (set per meet, default 20
  min). Uses actual race-day timing, not the paper schedule, since real
  heats always run early/late. Verified: heats finished at 12:37 with a
  15-minute rest setting → semi scheduled for 12:52.
- **Multi-day meets** — set the number of days when creating a meet, then
  assign each distance/boat-class combination (e.g. K1 1000m/500m/200m,
  K2 500m/200m) to a specific day in Race Office. Race Sort and Race
  Program both get a Day filter once a meet has more than 1 day.

## What changed in this update (round 4) — race sequencing

Honest framing first: full optimal day-scheduling (accounting for every
athlete's every round, minimizing total meet time) is a genuinely hard
problem, and semis/finals don't exist as races until their heats actually
finish (their composition depends on who qualifies). So this is a real,
tested heuristic toolkit, not a magic optimiser:

- **Real bug fixed**: races now display in ACTUAL schedule-time order
  everywhere (Race Program, Tower, Board) — not creation order. A semi
  created mid-day (with a rest-gap-based time) could previously show up
  after still-pending heats it should come before. Verified: manually set
  three races to 09:00/08:00/08:30 in raceNumber order 1/2/3 — they now
  correctly display 08:00→08:30→09:00.
- **Auto-sequence** — one button, front-loads heats from multi-round
  events (so their semis/finals can start sooner) and intersperses
  straight finals so results keep coming rather than one giant heat block.
  Tested: 3 heats + 3 finals correctly interleaved 1:1.
- **Manual reorder (▲▼ buttons)** — not drag-and-drop (unreliable on
  tablets, which is how this gets used) but the same practical outcome:
  nudge any not-yet-started race up or down, then "Re-run start times" to
  reflow the schedule to match. Tested end-to-end.
- Semis/finals still can't be manually reordered before they exist —
  they're scheduled automatically via the rest-gap system once their
  heats finish.

## What changed in this update (round 5)

- **Placeholder semi/final slots** — the moment heats are drawn, empty
  semi/final race slots are created too (with lanes 1..venue-capacity all
  empty), reserving their spot and time in the running order from the
  start. When heats finish and real qualifiers are known, that SAME slot
  gets filled in-place (same race number, same position) rather than a
  new race appearing at the end of the list. Verified end-to-end: drew a
  20-boat event, saw empty semi/final placeholders immediately, ran the
  heats, watched the same race IDs fill with real names.
- **PDF is now a flat, time-ordered running order** — not grouped
  alphabetically by event. Every race, in actual schedule order, showing
  "[TBC — pending qualifiers]" with empty Lane 1-9 for anything not run
  yet. This is what "Download Programme" now produces.
- **Move an entry to a different event** — new tool in Race Sort. Fixes
  wrong-event entries (e.g. entered 2000m, should be 5000m) — pulls them
  out of any un-started race and reassigns which event they belong to.
  Tested end-to-end.
- Renamed remaining "Bib" references in the PDF to "Slide" (missed one
  spot last round).

## What changed in this update (round 6) — Results page rebuilt

- **Weigh-Station-style browsable cards** — no more picking one event from
  a dropdown. Every finished race shows as its own card, in running order,
  results already sorted by finish position. Filter box for quick lookup.
- **Medal badges (🥇🥈🥉) only on finals** — heats/semis show times and
  positions for reference but never award medals, matching how badges
  should actually work.
- **Combined age groups split correctly, with one deliberate exception**:
  lane races combined to make up numbers (e.g. U14+U16 sharing lanes)
  split back into separate result cards per original age category — each
  gets its own medal count, since they're still different categories.
  Mass-start races (2000m/5000m) stay as ONE combined result, matching
  your "2000m U8-U12 Male" grouping design — not split back apart. Tested
  both paths directly against real data to confirm the distinction holds.

## What changed in this update (round 7)

- **Real bug fixed**: Tower was never reading a combined race's custom
  label — it always fell back to the primary event's own name. Fixed and
  verified: renamed a combined race's label, confirmed Tower now shows
  the new name, not the original.
- **Combined race labels are now editable any time** — click into the
  label text field in Race Program (section 4) to rename it, even after
  the race has run. Every page (Tower, Board, Results, PDF) reads this
  same field, so a rename here is what sticks everywhere.
- **Delete paddler** — new option in Race Sort's "Fix a wrong entry" tool,
  next to Move. Permanently removes a genuinely mistaken entry (e.g.
  entered twice); distinct from Scratch, which is for real withdrawals and
  stays reversible.
- **Move a race to ANY position**, not just one step at a time — jump to
  top (⤒), jump to bottom (⤓), or type an exact position number and hit
  Enter. Tested: moved a race from last to first in one action.
- **Day selection now shared across every page** — Tower, Weigh Station,
  Results, Board, Race Program, and Race Sort all read the same
  persisted day choice (per meet), instead of each page having its own
  separate, forgotten-on-reload selection. Change it once, it holds
  everywhere. Verified: Tower correctly shows only Day 1's races when Day
  1 is selected, only Day 2's when Day 2 is selected.

## What changed in this update (round 8) — Tower blind-capture timing

The lane-tap grid is gone for lane races, replaced with a two-step flow
designed for split-second finishes:

- **Capture**: one big button (or just physically press Enter/Space on a
  keyboard — real button focus means this works natively, no custom
  keyboard code needed) every time a boat crosses. No aiming for the
  right lane under pressure — logs a timestamp and finishing order only.
- **Assign**: afterward, at a safe pace, type the lane number into a
  blank box next to each captured crossing and hit Enter. The athlete's
  name fills in immediately. Once only one crossing and one lane are left
  unmatched, they're paired automatically — the last one doesn't need
  typing.
- **Undo last crossing**: one button, removes the most recent press (and
  its assignment, if it had one).
- Focus is preserved deliberately: the capture button re-focuses itself
  after each press so you can just keep mashing Enter; assignment inputs
  won't get yanked away mid-type by a background refresh.
- Mass-start races are unaffected — they already use bib-number entry,
  which solves a different problem (bibs are visually distinguishable at
  a glance; lanes under time pressure are not).

Tested a full realistic race end-to-end: 7 rapid captures, assigned 6 by
typing lane numbers, confirmed the 7th auto-paired correctly, and the
final Results page showed all 7 correctly ranked and timed.

## What changed in this update (round 9)

- **Lane-capacity checking moved earlier in Race Sort.** Previously, going
  over the venue's lane count while combining lane races only surfaced as
  an error when clicking "Create all staged combined races" — potentially
  several groups later. Now: the "+ Add" button itself disappears (shown
  as a red "would be X boats — over Y lanes" warning) for any event that
  would push a group over capacity, the moment you're looking at it. A
  live running count ("4 boat(s) of 9 lanes") shows in the current-group
  box as you build it, turning red if somehow over. The original
  server-side check still exists underneath as a safety net. Confirmed
  the "+ Add" logic is lane-count aware (traced against the same 6/7/9
  lane venues already verified for Tower) and that mass-start groups
  (no lane limit) are correctly unaffected by this check.

## What changed in this update (round 10) — critical recovery + real bugs found

- **Root cause found for the "race disappeared" / PDF-vs-live-page
  mismatch**: a race got locked as "finished" while most lane crossings
  still had no lane assigned. Once finished, Tower hides it (races
  don't clutter once done) — but there was no way back in to fix it. This
  is now fixed with a genuine recovery path:
  - **"Reopen race"** button in Race Program (on any finished race) —
    puts it back to "running," reappears on Tower exactly where you left
    off, nothing already captured is lost. If reopening a heat/semi whose
    completion had already (prematurely) filled the next round with
    incomplete data, that gets reverted back to an empty placeholder too,
    so re-finishing correctly recomputes it.
  - Tower's "End race" now warns clearly if crossings are unassigned or
    lanes have no result at all, before locking — so this is much less
    likely to happen by accident going forward.
  - Tested the exact broken scenario end-to-end: captured 4 crossings,
    assigned only 1, force-finished, confirmed it vanished from Tower and
    showed only 1 of 4 lanes on the live page (matching what was
    reported) — then reopened it, confirmed all 4 crossings were still
    intact, finished assigning the rest, and got a complete 4-boat result.
- **Real bug found and fixed: manual race reordering had no visible
  effect** once a race already had a start time set. The display was
  sorting by scheduled TIME first (a fix from a few rounds ago, for a
  different problem that's since been solved differently by placeholder
  slots). Moving a race changes its raceNumber, but time was deciding
  display order — so the move looked like it did nothing. Reverted to
  raceNumber-only ordering, which is correct now that placeholder slots
  already reserve the right sequential position from draw time. Verified:
  moved a race from last to first, confirmed it now displays first.
- **Distances no longer mix in the schedule.** Auto-sequence now fully
  completes one distance (every heat/semi/final drawn so far) before
  starting the next, instead of interleaving heats/finals across
  different distances. Verified: 200m/500m/1000m events all correctly
  grouped in complete, separate blocks.

## What changed in this update (round 11) — audit + Draw split out

Did a systematic sweep for leftover bugs from the accumulated changes,
plus split Race Program into two pages since it had gotten crowded.

**Found and fixed (real bugs, not cosmetic):**
- Two places still said "Use the ▲▼ buttons" describing controls that
  had already been replaced with ⤒/position-number/⤓ several rounds ago.
- Three backend error messages still said "bib" instead of "slide" —
  "Mass-start races use bib entry instead," "No boat is wearing bib X,"
  "Unknown bib for this race," and "Bib X has already completed all
  laps" — these would have shown the wrong terminology in an alert.

**Checked and confirmed clean:** nav bars consistent across all 8 pages,
no remaining "Bib" references anywhere else, day-filtering present on
every page that needs it, no orphaned function calls after the page
split, Board correctly has no nav (intentional — public/read-only page).

**New page: `/draw.html`** — pulled "Draw events" (Generate, Confirm,
Change, Race anyway, mass-start slide assignment) out of Race Program
into its own page. The flow is now: Race Office → Race Sort → **Draw**
→ Race Program → Tower. Race Program keeps Start times, Round
advancement, the detailed race list with sequencing tools, and Finalise
— noticeably less to scroll through. Venue info (lane count) moved to
Draw, since that's where it's actually decided.

Verified the full pipeline end-to-end through the new structure: combine
in Race Sort → draw in Draw → sequence + finalise in Race Program →
blind-capture a heat in Tower → correct results, all with the page split
in place and no broken references.

## What changed in this update (round 12) — the PDF/Draw mismatch, root cause fixed

- **Root cause found**: moving or deleting an entry (Race Sort's "Fix a
  wrong entry") that was already sitting in a DRAWN race only blanked
  that one lane, leaving the race half-populated with no signal it
  needed redrawing. That's exactly what the screenshots showed — a
  6-person final reduced to 1 visible person live, while an
  earlier-downloaded PDF still showed all 7 (the PDF wasn't stale or
  cached — it was just downloaded before the fix-entry changes).
- **Fixed**: moving or deleting someone already in a drawn (not yet
  started) race now undoes that ENTIRE draw — same as clicking "Change"
  on the Draw page — instead of leaving a stale gap. The event correctly
  reverts to "undrawn" and shows the corrected entry count immediately.
  Race Sort now tells you explicitly when this happens and which race(s)
  need redrawing. Scratch is untouched (a withdrawal correctly still just
  leaves an empty lane — that's expected racing behaviour, not a data
  error).
- Verified end-to-end: combined 3 age groups into one final, deleted one
  entry via Fix Entry, confirmed the whole draw properly reverted to
  undrawn (not a gappy stale race), redrew it, finalised, and confirmed
  the live Race Program page and a freshly-downloaded PDF show byte-for-
  byte the same roster.
- The PDF has been cache-proof since an earlier round (no-store headers +
  cache-busting download); added a note directly on the Race Program page
  confirming it's always generated fresh from current data.

## What changed in this update (round 13) — PDF rebuilt as a condensed programme

Rebuilt the downloadable PDF to match the structure of a real regatta
programme (32nd SA Schools Sprints/SA Sprints, Roodeplaat Dam) the user
shared as a reference — replacing the old detailed lane-by-lane draw
sheet.

- **New format**: Event # / Description / Time — one line per race, no
  lane/name detail (that stays live on Race Program and Board). Matches
  the reference document's structure directly.
- **Day-aware**: pass `&day=N` (the PDF button on Race Program now does
  this automatically, following whatever day is currently selected) to
  get a single-day programme, same as the reference being one PDF per
  day.
- Naming convention deliberately left unchanged ("1000m K1 U14 Male") —
  confirmed with the user to keep this format and apply it consistently
  everywhere, rather than adopting the reference document's "U14 Boys
  1000m K1" style.
- Placeholder (not-yet-run) races show [TBC] in grey; overridden
  (below-minimum, forced) races show [OVERRIDDEN] in red.
- Verified against a realistic scenario: 2-day meet, 1000m on day 1,
  500m on day 2, auto-sequenced, day-1 PDF downloaded — correct condensed
  table, correct day scoping, correct TBC flagging on not-yet-run
  semi/final placeholders.

## What changed in this update (round 14) — matched to a real regatta programme

Studied the user's real reference documents (32nd SA Schools Sprints/SA
Sprints — Program, Draws, and Results sheets) in detail and matched the
app's output to that structure.

- **Club codes** — 3-letter codes (DAB, SOW, ACD...) auto-generated the
  first time each club is seen at import, editable in Race Office (new
  "Club codes" section). These aren't guaranteed to match official
  federation codes (some are negotiated, e.g. "Academy for Canoe
  Development" → "ACD" isn't a pure algorithm — tested this directly:
  auto-generation matched 2 of 7 real reference clubs exactly, close but
  not identical on the rest), which is why editing is built in from day
  one. Used throughout — draw sheets, results.
- **New: detailed draw sheet as Excel** (`Download Draws (Excel)` on
  Race Program) — matches the reference "Draws Day X" sheet exactly:
  `Event N: Description` header with start time, then a
  Pos/Lane/Name/Surname/Club/PSA ID table. Lane races always show all N
  lanes (blank placeholder rows for empty ones, matching the reference's
  fixed 9-row blocks); mass-start races show only real entries (no fixed
  slot count, correctly using "Slide" instead of "Lane"). Day-aware, same
  as the condensed PDF.
- **"Leave for Start" column** added to the condensed Programme PDF — a
  configurable lead time (default 20 minutes, matching the reference)
  before each race's start time.
- Verified end-to-end against real data: condensed PDF, detailed Excel
  draw sheet (both lane and mass-start races), and club codes all
  produced correct, consistent output.

## What changed in this update (round 15)

- **Club merge tool** — the same real club sometimes ends up with two
  different spellings in imported entries (e.g. "DAB" vs "DABS", "SOW"
  vs "SCARC"). Editing the code alone wasn't enough, since the underlying
  athlete records stayed split across two different club names — anything
  grouping/filtering by club would still miss half of them. New "Merge
  into this →" control in Race Office's Club Codes section actually moves
  every athlete from the duplicate spelling to the correct one, then
  drops the duplicate from the list entirely. Verified: merged 26
  athletes from one club into another, confirmed the source club vanished
  from the list, and confirmed every one of those athletes now shows the
  correct merged club (and code) in an actual race draw, not just in the
  codes table.

## What changed in this update (round 16) — official club codes

Correcting an earlier misstep: I initially thought "DAB vs DABS" and "SOW
vs SCARC" meant two different clubs with inconsistent spellings, and
suggested merging them. That was wrong — they're the same single club;
my auto-generated code guess just didn't match the real one. No harm
either way (merging two spellings of the same club is a no-op), but the
actual fix needed was correcting the code, not merging anything.

- **New: "Import official codes"** in Race Office's Club Codes section —
  upload a reference spreadsheet (Club / Abbreviation / Union columns,
  matches PSA's published format) and every matching club's code and
  union get set at once, always overwriting (it's the authoritative
  source, not a guess). Clubs in the reference that haven't shown up in
  any entries yet are stored too, ready for whenever they do — this
  persists across meets, not just the current one.
- **Union field added** — each club now optionally carries its regional
  union (CDCU, PSG, KNCU, WCCU, ECCU...), shown in the codes table.
- **GCU → PSG** — the old "GCU" union code is automatically translated to
  "PSG" on import, matching the real-world rename.
- Verified against the user's actual official reference file: Dabulamanzi
  Canoe Club correctly corrected from my guessed "DAB" to the real
  "DABS", Soweto Canoe Club from "SOW" to "SCARC", all Gauteng clubs
  correctly show union "PSG", and all 84 clubs in the reference loaded
  successfully (8 matched to clubs already in this meet's entries, the
  rest stored for future meets).

## What changed in this update (round 17)

- **Combining into heats** — previously, combining events that added up to
  more boats than lanes was simply refused. Now it draws exactly like any
  oversized single event: split evenly into heats (ICF 5.1.3, max 1 boat
  difference between heats), center-out lane seeding preserved, full
  semi/final placeholder structure created automatically. Verified: 30
  combined boats (10+20) correctly split into 4 heats of 8/8/7/7, with
  the same semi→final structure a single 30-boat event would get.
- **Times now auto-reflow on any reorder** — race 1 stays anchored at
  whatever time you originally set, and every other race automatically
  shifts to match, whenever you use the sort buttons (single-step ▲▼
  restored alongside the jump-to-position ⤒/⤓/number controls) or
  auto-sequence. No more separate manual "re-run start times" step.
  Verified: moved a race, confirmed race 1 stayed at 08:00 and everything
  else re-flowed automatically with zero extra clicks.
- **Sections reordered on Race Program**: 1. Race Program (sort/sequence
  the list) → 2. Round advancement → 3. Start times — sequencing now
  happens before setting the clock, not after.
- **Club codes clarified** (no code change) — they're purely for the
  detailed Draws Excel sheet and other compact displays; skip that
  section entirely if you're not using that export.
- On the specific stale race reported (Gabriela alone when the download
  showed more): this looks like the same pre-existing-stale-race issue
  fixed a couple of rounds back — the fix stops it happening going
  forward, but doesn't retroactively repair a race that was already
  broken before upgrading. Use "Change" on that specific race to fully
  undo it, then redraw — the corrected draw and PDF will then match.

## What changed in this update (round 18)

- **Empty cells in the Draws Excel sheet now show "-" instead of "0"** —
  applies to empty lanes (all fields), and to the Pos column before a
  race has run. Verified against real data.

## What changed in this update (round 19)

- **"Fix entries here" link added to every row in the Combine list** —
  spotted a suspicious 0/1-entry category while combining? Click the new
  link right there instead of scrolling to find the Fix Entry search box
  separately; it jumps down and pre-fills the search with that event, so
  the athlete(s) in it show up immediately, ready to move or delete.
- **Re-verified the live/PDF/Excel consistency directly**: reordered
  races and confirmed identical order, times, and content across all
  three. Also re-confirmed the earlier stale-draw fix is airtight —
  deleted a paddler from an already-drawn combined final and confirmed
  the WHOLE draw correctly reverted to undrawn (not a stale gap). No bug
  found in the current code; a live/PDF/Excel mismatch can only happen if
  they're compared at different points in time (e.g. one downloaded
  before a Fix Entry change, one after) — as long as all three are
  checked after any changes, they will match.

## What changed in this update (round 20) — root cause of the "2000m works, lane finals don't" confusion

Traced this precisely: recreated the exact scenario (combined lane final,
scratched several boats down to 1 remaining), then compared the LIVE
Race Program screen against a FRESHLY generated Excel at the same
instant — they matched perfectly, both showing only the 1 remaining
boat. No bug in how combining works for lane races vs mass-start.

**The real explanation**: the 2000m combine "worked" because it was
never edited after being combined — nothing changed, so any check of it
still shows the original full data. The lane finals showed a mismatch
because they WERE scratched/fixed after the Excel/PDF had already been
downloaded once — the screenshots were comparing an old snapshot against
the current live state, not two different live views of the same
moment.

Since this same confusion has come up a few times now, made it much
harder to happen by accident:
- **Both the PDF and Excel now show an explicit, prominent timestamp**:
  "Generated [date/time] — snapshot, not live. Re-download after any
  change." Previously the PDF had a plain timestamp and the Excel had
  none at all.
- Rule of thumb going forward: **the Race Program screen is always
  current; a downloaded file is only as current as when it was
  downloaded.** After any scratch, fix-entry, reorder, or redraw,
  re-download before trusting the file again.

## What changed in this update (round 21) — see who's where without leaving the Draw screen

- **New: "View draw ▾" button on the Draw page** — click it on any drawn
  event and it expands right there showing the actual lane-by-lane
  breakdown (names, club, TBC status for pending semis/finals) — pulled
  live, same data as everywhere else. No more needing to jump to Race
  Program or download a file just to confirm who's in a race.
- **0-entry categories no longer clutter the Combine list** — if you've
  already fixed/moved everyone out of a category (down to 0 entries),
  it's filtered out of the active "+Add" list entirely and mentioned once
  in a small summary line instead, since there's nothing left to combine.
- **Move feedback now shows the destination's updated count** — "Moved to
  X — that event now has N entries," so it's unmistakable where they
  actually landed, not just that the move succeeded.
- Verified all three together end-to-end.

## What changed in this update (round 22) — investigating "can open but can't do much else"

Did a very thorough re-check: full re-read of every recently-changed file
line by line, checked for duplicate function declarations across all 9
pages (none found), verified the exact delivered zip's files (not just
my working copy) contain all expected functionality, and ran a fresh
extract-install-run cycle end to end (all pages load, full pipeline
works: meet → import → draw → 4 boats correctly drawn, no server
errors).

Couldn't reproduce a broken interaction through this — but found and
fixed a real, high-value risk regardless: **the server was using default
static file caching**. This app gets updated (a new zip re-downloaded)
far more often than it needs fast repeat-load performance, and under
certain browser conditions, default caching can silently serve an old
cached JS file alongside new HTML that calls functions the old file
doesn't have yet — which looks exactly like "the page opens, but nothing
responds." Disabled caching entirely for all static files (HTML/JS/CSS):
every page load now always fetches fresh from the server, no matter what
the browser cached before. Verified the no-cache headers are actually
being sent, and re-ran the full pipeline to confirm nothing else broke.

If this doesn't resolve it: please check the browser's developer console
(F12 → Console tab) when you click a button that doesn't work, and share
what error (if any) shows up red — that'll point directly at the actual
problem rather than me guessing further.

## What changed in this update (round 23) — the REAL bug behind "Race 3 shows different data in different places"

Found and fixed a genuine race-number collision bug — not a stale
download this time, both views you showed were live.

**Root cause**: reordering races (▲▼/⤒/⤓/position controls) computed new
race numbers using "how many locked races exist across the whole meet."
That's fine when reordering touches every pending race at once, but on a
multi-day meet with a day filter active, only THAT day's races get sent
to the server — so the freshly-computed numbers could land on numbers
already used by a DIFFERENT day's still-pending races, which weren't
part of the reorder and never got checked. Two completely different race
records ended up sharing the same race number. Depending on which one a
given page happened to load, you'd see different data for "Race 3" —
exactly what the screenshots showed.

**Fixed**: reordering now reuses the exact set of race numbers the
races being reordered already hold — just permuted into the new
order — instead of inventing fresh numbers. This makes a collision
structurally impossible, since those numbers were already exclusively
"owned" by that exact set of races.

Reproduced the precise scenario end-to-end (3-day meet, 1000m/500m/200m
across days, reordered Day 3 only) and confirmed: before the fix this
produced colliding race numbers, after the fix there are none, and the
reorder still lands correctly within that day's number range.

Note: this prevents the collision going forward. If a meet already has
existing corrupted data from before this fix, starting that specific
day's draw over (Change → redraw) will clear it, since the fix only
stops new collisions from being created, it doesn't retroactively repair
already-saved bad data.

## What changed in this update (round 24) — the actual root cause of "results not showing, semi not auto-filling"

Traced every symptom in the screenshots back to ONE root cause: typing a
lane number into a crossing's assignment box only submitted on pressing
Enter — if that didn't register (clicked away, tabbed, whatever), the
number just sat there visually but was never actually sent to the
server. Locking the race at that point saved it as "finished" with
**zero** actual results — which cascades into everything reported:
Results showing blank cards, Board showing no times, and the semi never
auto-filling (nothing to advance, since zero boats had a recorded
finish).

Reproduced this exact chain end-to-end: captured crossings, deliberately
left them unassigned, force-locked the race — got the exact same 0
results, unfilled semi, and blank Results cards. Then recovered it:
Reopen → properly assign this time → re-finish, and the semi correctly
auto-filled with real qualifiers.

**Fixed for good**:
- Every crossing's lane box now has an explicit **"Assign" button** —
  not just Enter-key. Also assigns automatically if you click/tab away
  from the box with a number still in it (blur), so a typed value can no
  longer be silently lost regardless of how you finish interacting with
  it.
- **Results page now explains itself** instead of showing a blank card:
  if a race locked with zero results recorded, it shows exactly why and
  what to do — "locked with no results recorded... Reopen race on R[N],
  finish assigning, then lock it again."

For any race already broken by this: **Reopen race** (Race Program) →
assign the crossings properly this time → finish it again. That's
exactly the recovery sequence tested above, and it correctly re-triggers
the semi/final auto-fill.

## What changed in this update (round 25) — hard-blocking incomplete races, weigh-in gating, phase filter

- **Hard block on closing a race**: "End race" is now refused server-side
  (not just warned) if any lane has no result at all — no more "lock
  anyway" bypass, since that's exactly what caused the zero-results bug a
  few rounds back. Every lane needs either a real result or an explicit
  DNS/DNF mark before the race can close. Tested: rejected with zero
  crossings assigned, rejected with 1 of 4 lanes still unresolved,
  succeeded once every lane had a result or DNS mark.
- **Weigh-in completion rule**: podium (positions 1-3) must be weighed,
  plus one more "random check" boat if there are 4+ finishers. New
  `weighInStatus` on every finished race shows exactly what's still
  needed. Tested: correctly incomplete with only 1st+2nd weighed,
  correctly complete once podium + 1 random were done.
- **Semi/final now gated on weigh-in, not just auto-created**: a
  semi/final is still computed and filled immediately when its
  predecessor round finishes (same as before), but it's held back from
  Tower's active list until that predecessor round's weigh-ins are
  cleared. Verified end-to-end: heats finished, semi correctly invisible
  on Tower (though fully filled behind the scenes) until all heats'
  podium+random checks were weighed — then it appeared.
- **Phase filter on Tower** (All / Heats / Semis / Finals tabs) — the
  "broken down" view requested, so it's clear what's happening at each
  stage without everything mixed together.
- Re-verified Draw page and Excel show identical data after a combine —
  confirmed matching directly.

## What changed in this update (round 26) — FOUND the Race Program vs Excel mismatch

This one had been reported several times and I'd previously (wrongly)
attributed it to stale downloads. It was a genuine bug, and here it is:

**Root cause** — `program.html` line 408 built each lane's dropdown from
`allEntries.filter(e => e.eventId === race.eventId)`. For a COMBINED
race, `race.eventId` is only the PRIMARY member event. Athletes belonging
to any of the OTHER combined categories therefore had no matching
`<option>` in that dropdown, so the `<select>` silently fell back to
displaying "— empty —" — even though they were correctly assigned to
that lane in the actual data. The Excel draw sheet prints names directly
with no dropdown, which is exactly why it was always right and this
screen wasn't.

**Fixed**: the dropdown now loads entries from every member event
(`race.combinedEventIds`), not just the primary. Verified with a 6-boat
combined race: the old code could only display 2 of 6 occupants, the new
code displays all 6 — matching the Excel byte for byte.

**Also fixed**: combining events whose combined total is still below
ICF 5.1.1's 3-boat minimum is no longer refused. Combining is often
precisely HOW an undersized category gets raced at all, so blocking it
defeated the tool's purpose. It now draws as a straight final and is
flagged OVERRIDDEN (same treatment as "Race anyway" on a single event)
rather than silently sub-minimum. Applies to both lane and mass-start
combines. Verified: two 1-boat events combined into a 2-boat race,
correctly flagged overridden.

## What changed in this update (round 27) — K2/K4 crews on the Excel draw sheet

The Excel draw sheet only ever wrote `info.names[0]` and
`entry.athleteIds[0]` — the FIRST paddler in the boat. For a K2 (or K4,
C2, C4) the remaining crew silently vanished from that sheet, even
though the Race Program screen correctly showed the full crew. This was
the mirror image of the previous round's bug: last time the screen was
wrong and Excel was right; here Excel was wrong and the screen was
right.

**Fixed**: one row per crew member. The lane number repeats on each
crew row so it's unambiguous they're the same boat, and Pos appears once
per boat so it can't be misread as two separate results. Each crew
member now carries their own name, club code and PSA ID (crew mates can
be from different clubs).

Verified: K2 writes 2 rows per boat, K4 writes 4, and K1 still writes
exactly 1 (no regression) — checked against both the synthetic K2/K4
file and the real GCU entries.

## What changed in this update (round 28) — K3 support

South Africa races K1, K2 and K3. K3 was NOT supported at all:

- **K3 wasn't a recognised boat class on import.** `BOAT_TOKENS` listed
  K4/K2/K1/C4/C2/C1 but not K3, so a race named "500M K3" parsed as
  Unknown and every one of those rows was SKIPPED with a flag. Added K3
  (ordered before K2/K1 so the substring match doesn't misfire).
- **K3 had no minimum boat weight.** Added 24kg — but flagged clearly,
  because this is INFERRED, not published: ICF has no K3 class at all,
  and the PSA handbook mentions K3 exactly once (2.4.2, treating K3s and
  K4s as K2s for grading) without giving a weight. 24kg follows ICF's own
  linear 6kg-per-seat pattern (K1 12, K2 18, K4 30). Since boat weight is
  a DQ matter, the weigh station now shows an amber warning on any K3
  check saying the figure is unconfirmed, and the DQ reason text says
  "INFERRED minimum — confirm before DQ" rather than citing ICF/PSA.

Verified end to end with a synthetic 3-crew K3 file: imports cleanly (3
entries, 9 athletes, no flags), draws correctly, all three paddlers per
crew appear on both the Race Program screen and the Excel sheet, and a
22kg weigh-in correctly fails against the 24kg minimum WITH the
unconfirmed-figure warning attached. K1 (12kg) and K2 (18kg) confirmed
unchanged and correctly not flagged as inferred.

C1/C2/C4 and K4 are left in place — they cost nothing and removing them
would only risk a silent import failure if one ever appeared.

## What changed in this update (round 29) — K3 weight rule removed

Removed the inferred 24kg K3 minimum added last round. Every weight
figure in MIN_WEIGHT_KG is now a published rule again (ICF Ch.3 + PSA
2.2.1 for Guppy) with nothing guessed — an invented minimum could
wrongly disqualify a boat, which is a worse failure than having no rule.

K3 is still RECOGNISED on import, deliberately. Removing it from
BOAT_TOKENS would mean any "500M K3" row gets parsed as Unknown and
skipped, losing entries. Keeping it costs nothing if K3 never appears,
and if one ever does it imports normally and the weigh station says "No
minimum weight on file for boat class K3 — weight recorded, but no
pass/fail judgement made" rather than inventing a threshold.

Verified: K1 (12kg) and K2 (18kg) DQ correctly with the proper ICF/PSA
citation; a K3 imports cleanly with no flags and gets recorded without
a pass/fail judgement.

## What changed in this update (round 30) — DAB/SOW fixed at the source, official list on screen

Two changes, both from the official "2026 Club codes & Unions" reference:

- **New: official reference table on Race Office**, at the bottom of the
  page — every club, its online abbreviation, and its union, exactly as
  the official sheet has them (80 clubs across CDCU/ECCU/GCU/KNCU/WCCU).
  Purely a look-up; it doesn't feed into or change anything else on the
  page. To actually apply a code/union to clubs already in the system,
  the existing "Import official codes" upload in the Club codes section
  is still what does that.
- **DAB and SOW are now fixed automatically, not just mergeable.** These
  are the same real clubs as DABS (Dabulamanzi) and SCARC (Soweto) —
  confirmed against the official list. Rather than relying on a manual
  "Merge into this →" click after the fact, entries import now rewrites
  DAB → DABS and SOW → SCARC the moment a row is read off the sheet, so
  they never get the chance to become two separate club records. A
  startup check also cleans up any DAB/SOW already sitting in a meet's
  data from before this existed, carrying across their GCU/PSG union if
  one was set. The alias list lives in `src/club-aliases.js` — a plain
  two-line map, so adding another known alias later (if one turns up)
  is a one-line change, not a rebuild.

Verified: imported a sheet with DAB and SOW in the CLUB column — both
landed as DABS/SCARC with no duplicate club created; a database with
pre-existing "DAB"/"SOW" athletes and a GCU union set on them got
cleaned up automatically on server start, with the union preserved
under the correct (DABS/SCARC) name.

## What changed in this update (round 31) — one club-codes screen, not two, and a real bug fixed along the way

Feedback from last round: the new reference table and the existing Club
codes card were showing overlapping information, and the "Import
official codes" upload was an extra manual step for something the app
already had on file. Consolidated to one automatic flow:

- **The official reference is now applied automatically on every
  import** — no upload button. Every club is matched by name against
  the official PSA list (baked into the app as `src/club-reference.json`)
  and gets its real code and union set immediately; anything not on that
  list still gets a guessed code so it's never blank.
- **Removed**: the "Import official codes" upload (Race Office no longer
  needs a file for this), and the separate reference table at the bottom
  of the page — its only job was showing what's now applied automatically
  above.
- **A real bug turned up while testing this**: the DAB→DABS / SOW→SCARC
  fix from last round mapped to the *code* ("DABS") rather than the
  club's actual *name* ("Dabulamanzi Canoe Club") — which meant it didn't
  line up with the official reference (matched by name) and those two
  clubs weren't picking up their real code/union automatically. Fixed:
  the alias list now maps to full club names, matching how every other
  club in the system is identified. Also added "DABS" and "SCARC"
  themselves as recognised aliases (on the chance the code turns up as
  the raw value instead of the short form), not just "DAB"/"SOW".

Verified: imported a sheet with DAB, SOW, and a full club name in the
CLUB column — DAB and SOW correctly resolved to Dabulamanzi/Soweto with
code DABS/SCARC and union PSG, matching a club not on the official list
still got a sensible guessed code. Also verified a database with old
"DAB"/"SCARC" athlete records gets fully corrected — name, code, and
union — automatically the next time the app starts, no re-import needed.

## What changed in this update (round 32) — "Fix entries here" showing more than one athlete

Reported: clicking "Fix entries here" on Race Sort sometimes showed more
than one row for what looked like a single event.

**Root cause, two parts:**
- Age category and gender from the import sheet went straight into each
  event's identity with no trimming or case-fixing. A stray space or
  "u18" vs "U18" between two import passes created a genuinely separate
  event that happened to render with an identical-looking label.
- "Fix entries here" searched by matching that label *text* against every
  entry's event label, rather than the specific event's id. If two events
  ever shared a label, it pulled entries from both.

**Fixed both ends:**
- Age category/gender are now trimmed and uppercased on import, so the
  same category always produces the same event — verified two rows with
  "U18" and "u18 " (trailing space) now correctly merge into one event
  instead of two.
- "Fix entries here" now matches the exact event id it was clicked from,
  not label text — so even an existing lookalike-labelled event (from
  data imported before this fix) can no longer leak into the results.

If you still see two rows for what should be one athlete after this
update, that means the duplicate event already existed in your data
before now — check "Review: what's combined so far" on Race Sort for any
event listed twice with the same-looking label, and let me know so we
can look at consolidating it.

## What changed in this update (round 33) — the actual duplicate-entry bug, found and fixed

Reported: every event showing double the real entry count (16 became
32), visible across every event and on the draw sheet — a real
regression, not a misreading.

**Reproduced it directly** with the real entries file: a single import
was clean (123 rows in, 123 entries out). Re-importing that *same* file
into the same meet was the actual trigger — it went in a second time and
created a second boat for every athlete already entered (18 became 36).
Events and athletes have always correctly deduped on re-import; entries
themselves never did. If you'd re-uploaded a refreshed copy of the
entries file at any point (a normal, sensible thing to do), that's
exactly what produced this.

**Fixed two ends:**
- **Import is now duplicate-proof.** Before creating a boat, it checks
  whether that exact event + exact set of athletes already has one — if
  so, the row is skipped, not re-added. Verified by importing the same
  real file three times in a row: 123 entries every time, never 246 or
  369.
- **Existing doubled data repairs itself automatically.** A cleanup runs
  once at server startup and merges duplicate entries back down — and if
  one of the duplicates was already drawn into a race, that's the one
  it keeps, so nothing about an existing draw breaks. Verified: manually
  doubled a meet's entries (123 → 246, with one of them already drawn
  into a race), started the server, and it correctly collapsed back to
  123 while keeping the specific entry the race pointed at.

If two duplicates of the same boat were BOTH already drawn into
different races (a genuinely ambiguous state), the cleanup leaves that
one group alone rather than guessing which to remove — if you hit that,
tell me and we'll sort it by hand.

## What changed in this update (round 34) — "Fix a wrong entry" can now move to a distance that doesn't have an event yet

Raised: the "Move to" dropdown only ever listed events that already
exist for this meet — so if nobody happened to be entered yet at (say)
5000m in an athlete's age category, there was no way to move them there
at all, and picking the right one out of every event in the whole meet
was unnecessarily fiddly for the everyday case of "just the wrong
distance."

**New: "Same category, different distance"** — a short dropdown of just
distances (200m, 500m, 1000m, 2000m, 5000m, plus anything else this meet
actually uses). Pick one and it keeps the athlete's current boat class,
age category and gender exactly as they are, changing only the distance
— creating that event on the fly if it doesn't exist yet rather than
requiring it to already be there. The full "pick any event" dropdown is
still underneath for genuine cross-category corrections (wrong age group
or boat class too).

Verified with the real GCU entries file: moved Daniel van Eeden from
200m K1 U18 Male to 5000m — a "5000m K1 U18 Male" event didn't exist
yet, so it was created automatically with him as its first entry. Moved
a second U18 K1 paddler to 5000m the same way and confirmed he joined
that same new event rather than creating a duplicate. Also confirmed
moving to the distance already selected is rejected rather than silently
doing nothing.

## What changed in this update (round 35) — Start times moved to the top of Race Program

Requested: move the "Start times" section to the top of the Race Program
page, as section 1, with the rest moving down.

Done — new order is **1. Start times, 2. Race Program, 3. Round
advancement** (was Race Program, Round advancement, Start times).
Reworded the two sections' help text to match: since reordering races
always keeps race 1 pinned to whatever start time is set, it never
actually mattered which you did first — the old text said "do this
last," which is no longer true now that Start times comes first, so
that's been corrected to say either order works. Also fixed a stale
"section 1" reference in the Finalise button's error message, which
pointed at the race listing — now section 2.

## What changed in this update (round 36) — simplified the race reorder buttons

Requested: remove the "jump to top" (⤒) and "jump to bottom" (⤓)
buttons from each race row on Race Program — the ▲▼ nudge-by-one buttons
were the ones actually worth keeping.

Removed both from every race row (lane races and mass-start races). The
# box (type a position, hit Enter) is still there and already covers
jumping to the top or bottom — type 1 for top, or a number past the end
for bottom — so nothing is actually lost, just two rarely-needed buttons
off the row. Updated the "Ordering" help text on Race Program to match.

## What changed in this update (round 37) — the "#" box wasn't discoverable as a working feature

Raised: unclear what the small "#" box next to the ▲▼ buttons on Race
Program actually does.

Turns out it already did exactly what was asked for — type the race
number you want, and that race moves there with everything else
shifting and renumbering correctly — but there was no visible way to
trigger it beyond knowing to press Enter in an unlabeled box, so it
wasn't discoverable as a feature at all. Fixed the presentation, not the
logic: the box is now labelled "Race #" with an explicit → button next
to it (Enter still works too), both with a tooltip explaining what it
does. Updated the "Ordering" help text on Race Program to describe it
the same way.

## What changed in this update (round 38) — a race can now demand its own gap before the next one

Requested: a way to say "this particular race needs 45-60 min before the
next one, not the standard 5" — and have everything after it shift to
match automatically, no matter where that race ends up if the running
order changes later.

**New: "min before next" box** next to each race's start time. Leave it
blank and that race uses the meet's standard gap (from section 1) like
always. Set a number — e.g. 45 for a long 2000m, 60 for a 5000m — and
only the gap *after that specific race* changes; everything before it,
and everything after it once it returns to normal-length races, keeps
the standard gap. This lives on the race itself, not a time slot, so
reordering, auto-sequencing, or moving it to a different position all
correctly carry the override along with it.

Verified end to end: three races at the standard 5-min gap (08:00,
08:05, 08:10); set race 1's gap to 45 min and confirmed race 2 jumped to
08:45 and race 3 followed at 08:50 (back to the standard 5-min gap after
it); moved that same race to last position and confirmed the other two
correctly reverted to standard 5-min spacing between themselves; moved
it to the middle instead and confirmed the 45-min gap still applied
correctly to whatever came after it in its new position; cleared the
override and confirmed everything returned to standard 5-min spacing
throughout.

## What changed in this update (round 39) — "space keeper" blocks for jetty moves, lunch, tea

Requested: a block, like a race, that can sit anywhere in the running
order, be moved up/down or deleted like one, and reserve a chunk of time
that pushes everything after it out to match — for anything that isn't
a race but still needs room on the schedule (moving a jetty between
courses, lunch, tea).

**New: "Space keeper" section on Race Program.** Give it a label (e.g.
"Jetty move to 200m course"), how many minutes it needs, and where to
insert it (a dropdown built from the current running order), then click
Add. It shows up as its own dashed amber block, styled distinctly from a
real race so it's never mistaken for one, with the same ▲▼ and jump-to-
position controls as races. Its label and duration stay editable
in-place afterward too.

**Design note, since it matters for correctness**: a space keeper is
NOT a race — it never gets a race number, never touches Tower, the
public board, weigh station, results, or exports; it exists purely on
Race Program's own planning view. Internally it sits between two race
numbers (e.g. "between race 2 and 3") rather than consuming one, so
moving it around, deleting it, or adding more of them never renumbers a
single real race. Moving an actual RACE past it works the same as
always too.

Verified end to end: added a 20-min space keeper after race 1 (three
races at 08:00/08:05/08:10) and confirmed race 2 correctly jumped to
08:25 and race 3 followed at 08:30; moved the space keeper down past
race 2 and confirmed the schedule recalculated correctly (08:00, 08:05,
space keeper at 08:10, race 3 at 08:30) while races 1/2/3 kept their
exact same race numbers throughout; confirmed the plain races endpoint
(what Tower/board/weigh actually use) never includes it; deleted it and
confirmed everything reverted cleanly to standard 5-min spacing.

## What changed in this update (round 40) — "Type of race" replaces the rest-minutes setting, first step toward multi-discipline

Requested: drop the "Minimum rest between rounds" field from the New
Meet dialog — not worth asking about every time — and use that spot for
a "Type of race" selector instead, since the plan is for this app to
eventually run more than just Sprints (Trilogy, Marathon, River are the
named ones so far).

- **Minimum rest is gone from the dialog.** Nothing about how the app
  actually behaves changed — auto-created semis/finals still won't be
  scheduled less than 20 minutes after the athlete's last race, same as
  before, it's just not something you're asked to set per meet anymore.
- **New: "Type of race" dropdown**, first thing in the New Meet dialog.
  Sprints is selected and the only one that works — Trilogy, Marathon,
  and River are listed as disabled options marked "(coming soon)", so
  the roadmap is visible without letting you create a meet in a format
  this app can't actually run yet. The meet dropdown everywhere else now
  shows the type alongside lanes/days too.
- Every meet stores its `raceType` now (defaulting to Sprints for
  anything created before this, or if it's ever omitted), so when
  Trilogy/Marathon/River formats actually get built, existing Sprint
  meets won't need any kind of migration.

Verified: creating a Sprint meet works and stores correctly; attempting
to create a Trilogy meet via the API is cleanly rejected with an
explanatory message rather than silently creating a broken meet;
omitting race type entirely still defaults safely to Sprints.

## What changed in this update (round 41) — found the actual cause of losing your place on the 2000m/5000m slide-number box

Reported: logging slide numbers for mass-start (2000m/5000m) races felt
slower than it should — needing to click back into the box before every
number, rather than a clean type-Enter, type-Enter rhythm.

**Root cause, found by tracing it**: the Tower page rebuilds a race's
card from scratch every time its data changes — including right after
you log a pass, and again on its own regardless every 1.5 seconds. Each
rebuild throws out the old input box and creates a brand new one. The
lane-race (heat/final) version of this page already knew to refocus the
new box after a rebuild if the old one had focus; the mass-start version
never did — so every single logged pass silently dropped focus, and the
code's own attempt to refocus was pointing at the old, already-discarded
box, so it did nothing. That's the actual mechanism behind "having to
place the cursor" every time.

**Fixed**: the mass-start card now remembers whether its slide-number
box had focus right before a rebuild, and refocuses the new one
afterward if it did — same pattern the lane-race version already used,
just applied where it was missing. Once you click into the box the first
time, it should now stay focused through every submit and every 1.5s
refresh, so type-a-number-Enter-type-a-number-Enter should run
continuously without needing the mouse again.

Backend untouched — logging passes, race state, and lap counting all
verified still working exactly as before; this was purely a focus bug in
the page's own rendering.

## What changed in this update (round 42) — DNS/DNF/DQ buttons on every lane/slide, on every race, before weighing

Requested: DNS/DNF/DQ buttons next to each name on Tower, for every
race, so a boat can be flagged before it moves on to weigh-in — plus a
clear "race fully complete" check that everything's in before locking.

Turned out the pieces existed but were incomplete:
- **DNS/DNF buttons only showed up for lanes with no crossing captured
  yet** — a boat that already had a real time couldn't be corrected to
  DNS/DNF/DQ at all, and DQ wasn't available anywhere as a manual action
  (only ever set automatically by a failed weigh-in).
- **Mass-start (2000m/5000m) races had none of this** — a slide that
  never completed its laps just sat with no result and no way to
  resolve it.
- **"End this race" already blocked lane races with unresolved lanes**
  (that's your "race fully complete" check, already there) — but it
  skipped that check entirely for mass-start races, since there was
  previously no way to resolve a non-finishing boat anyway.

**Now:** every lane (lane races) and every slide (mass-start races) has
its own persistent DNS / DNF / DQ buttons, plus a "Clear" button once a
result exists — usable at any time, whether that boat already has a
real captured time or not. DQ asks for an optional reason and — if the
boat had already finished — keeps its actual time on record for
reference while pulling it out of the ranked positions (the same thing
that already happened automatically for a failed weigh-in, now
available as a manual action too, and remaining results renumber to
close the gap). The "fully complete" lock now applies uniformly:
**every** lane/slide with a real boat needs a result — timed, DNS, DNF,
or DQ — before "Race fully complete — lock results" (renamed from "End
this race") will go through, on both race types. Marking any of this
after a race is already locked also un-confirms it, same as an
automatic weigh-in DQ already did, so the office knows to re-check it.

Verified end to end on both race types: a 4-lane race correctly blocked
finishing until every lane had a result, accepted a real time + DNF + DQ
(with reason) + DNS, then finished cleanly; converting an already-timed
lane to DQ correctly kept its time on record, cleared its position, and
correctly renumbered the remaining ranked boat; a 3-slide mass-start
race correctly blocked (a real behavior change — it used to let you
close with unresolved slides) until DNS/DNF were set on the two that
didn't complete their laps, then finished cleanly.

## What changed in this update (round 43) — a heat's semi could go genuinely missing after weighing, plus a rethink of Tower's tabs

Reported: after finishing and weighing a heat, no idea where the race
goes next — not on Tower anywhere, only visible later on Results and
the public board.

**Found a real cause, not just a tab-filtering mix-up.** An auto-created
semi/final (the ones the app creates for you the instant a heat/semi
finishes, no office action needed) only shows on Tower once it's both
published AND clear of its weigh-in gate. The weigh-in gate was working
correctly — the actual problem is that some of these auto-advanced races
could end up stuck **unpublished**, with no automatic path to ever flip
that — genuinely invisible on Tower forever until someone happened to
go back to Race Program and click Finalise a second time, something
nothing on Tower told you to do. Fixed: a round reached automatically —
no human decision in the loop, from an event already finalised once —
now publishes itself the moment it's created or filled in. The weigh-in
gate still applies on top of that exactly as before; this only removes
a redundant, invisible second gate that had no business being there.

**Also found and fixed a related but opposite bug while tracing this:**
an empty final — lanes not assigned yet, nobody in it — could show up on
Tower before its semi had even run, since the reserved placeholder slot
was getting published early too. Now a placeholder only appears once
it's actually been filled with real qualifiers, not before.

**Tower's tabs, rethought per your read of them:** dropped the "Heats"
tab entirely — every race, heats included, already lives on **All**, so
a separate tab for just heats didn't add anything. **Semis** and
**Finals** are now precisely what those words mean: Finals no longer
includes a straight final from a small field that skipped heats/semis
altogether (it stays on All only, since it's not "advancing" from
anything) — only finals that are genuinely a semi/final progression's
last step show there.

Verified with a real 12-boat/2-heat event: confirmed the semi and final
placeholder sat correctly invisible before either heat ran; ran both
heats to completion with full results and weigh-ins with no second
Finalise click; confirmed the semi appeared immediately, correctly
filled with its 6 qualifiers, while the still-empty final placeholder
correctly stayed hidden until the semi itself finishes.

## What changed in this update (round 44) — Weigh Station's wide entry bar replaced with a compact inline box

Requested: a small box right next to the weight, type and Enter, rather
than the full-width "Weight in kg" bar that opened up below each boat.

Done — an unweighed boat now just shows a small kg box and a Log button
directly in its row, no separate wide bar opening up underneath, no
extra click to reveal it first. Enter still submits. An already-weighed
boat still shows its ✓/✗ result with Re-weigh next to it as before;
clicking Re-weigh swaps that back to the same small box (with a Cancel
option to back out without changing anything).

**Also fixed while in here**: this page rebuilds its entire list every
5 seconds, same as Tower did — and had the exact same focus bug Tower's
slide-number box had before that fix. Typing a weight while that
5-second refresh landed would silently lose your place in the box.
Applied the identical fix: the page now remembers which kg box had
focus and hands it straight back after every rebuild, so typing a
weight and hitting Enter, one boat after another, should no longer get
interrupted.

Verified the actual weigh-in submission (unchanged on the backend) still
correctly records weight, checks it against the boat class minimum, and
flags a DQ when it fails — confirmed end to end through a full
race → finish → weigh flow.

## What changed in this update (round 45) — Live Board now shows real results order, medals, weights; the weigh-in rule corrected

Four related changes, all from the same feedback:

- **Results order, not slide/lane order.** A finished race on the Live
  Board now lists boats 1st, 2nd, 3rd... exactly like Results already
  did — not by whatever slide or lane number they happened to draw.
- **Medals** 🥇🥈🥉 now show on the board for finals, same as Results —
  and where a field's too small to award one (PSA 9.4's minimum boat
  counts), the same explanation Results already gave now shows on the
  board too, so paddlers can see exactly why on the spot.
- **Weights are shown** next to anyone who's been weighed, board and
  Results both — blank for anyone not weighed yet, so it's obvious at a
  glance who still needs it.
- **The weigh-in rule itself was corrected.** It previously required the
  podium (1st-3rd) *plus* one additional "random check" boat before a
  race counted as weighed — that extra requirement was removed. Per
  clarification: only positions 1-3 are compulsory; anything beyond that
  is entirely the office's own discretion, no cap, never a requirement.
  This was also the actual cause of races showing "Provisional —
  weigh-ins pending" even once every required weigh-in was done — the
  message was generic and didn't reflect real status, and mass-start
  (2000m/5000m) races weren't getting a weigh-in status computed *at
  all*, so they always showed the same generic pending message
  regardless of the truth. Both fixed: the message now says exactly
  what's actually outstanding (or "weigh-ins complete — awaiting office
  confirmation" once the podium's done), and it now applies to
  mass-start races too.

Verified with a real 6-boat final: weighed only the podium — confirmed
`complete: true` with no random-check requirement blocking it; results
came back in correct 1-2-3-4-5 order with weights attached only to the
boats actually weighed and blank for the rest; a boat that failed its
weigh-in correctly dropped out of the ranked list into DQ, and the
podium requirement correctly recalculated to the new 3rd-place boat
after that reshuffle.
