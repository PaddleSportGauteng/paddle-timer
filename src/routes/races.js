const express = require('express');
const db = require('../db');
const rules = require('../rules');
const { enrichRace, sortByScheduleThenNumber } = require('../present');
const progression = require('../progression');
const { VENUES, fetchConditions } = require('../venues');

// Recompute finishing positions for a race's results, handling dead heats
// per ICF 10.6.3 / 10.6.4: boats with identical finish times (to 1/100s)
// share the same position, and the next boat takes the position after
// that group (e.g. 1, 1, 3, 4). Only OK results are ranked.
function recomputePositions(results) {
  const ok = Object.entries(results)
    .filter(([, r]) => r.status === 'OK')
    .sort((a, b) => a[1].finishTimeMs - b[1].finishTimeMs);
  let pos = 1;
  for (let i = 0; i < ok.length; i++) {
    // Compare at 1/100s (centisecond) resolution — ICF publishes at 1/100
    const t = Math.floor(ok[i][1].finishTimeMs / 10);
    const tPrev = i > 0 ? Math.floor(ok[i - 1][1].finishTimeMs / 10) : null;
    if (i > 0 && t !== tPrev) pos = i + 1;
    ok[i][1].position = pos;
    ok[i][1].deadHeat = i > 0 && t === tPrev
      || (i < ok.length - 1 && Math.floor(ok[i + 1][1].finishTimeMs / 10) === t);
  }
}


const router = express.Router();

// A semi/final race isn't ready to run on Tower until the round that fed
// it has cleared weigh-in (podium + 1 random check — see
// present.js weighInStatus). autoAdvance still computes and fills
// the placeholder immediately when the predecessor round finishes — this
// only holds back its VISIBILITY on Tower, so "it moves to the semi
// screen after weighing" is enforced without delaying the actual
// qualification math.
function blockedByWeighIn(database, race) {
  if (race.isMassStart || race.placeholder) return false;
  if (race.phase !== 'semi' && race.phase !== 'final' && race.phase !== 'finalB' && race.phase !== 'finalC') return false;
  const event = database.events[race.eventId];
  if (!event) return false;
  const predecessorPhase = race.phase === 'semi' ? 'heat' : (event.plan && event.plan.numSemis > 0 ? 'semi' : 'heat');
  const predecessors = Object.values(database.races).filter((r) =>
    r.eventId === race.eventId && r.phase === predecessorPhase && r.status === 'finished'
  );
  return predecessors.some((r) => {
    const enriched = enrichRace(database, r);
    return enriched.weighInStatus && !enriched.weighInStatus.complete;
  });
}

// All races the tower cares about right now (published, pending or running).
router.get('/active', (req, res) => {
  const database = db.load();
  const meetId = req.query.meetId;
  if (!meetId) return res.status(400).json({ error: 'meetId is required — pick a meet first.' });
  const dayFilter = req.query.day ? Number(req.query.day) : null;
  const eventIds = new Set(
    Object.values(database.events)
      .filter((e) => e.meetId === meetId && (!dayFilter || (e.day || 1) === dayFilter))
      .map((e) => e.id)
  );
  const races = sortByScheduleThenNumber(
    Object.values(database.races).filter((r) =>
      eventIds.has(r.eventId) && r.published && r.status !== 'finished' && !r.placeholder && !blockedByWeighIn(database, r)
    )
  ).map((r) => ({ ...enrichRace(database, r), event: database.events[r.eventId] }));
  res.json(races);
});

router.get('/:id', (req, res) => {
  const database = db.load();
  const race = database.races[req.params.id];
  if (!race) return res.status(404).json({ error: 'Race not found' });
  res.json(enrichRace(database, race));
});

// Starter/tower hits this the instant they hear "go" over the radio.
// Supports several races running at once (e.g. next 1000m start fires
// before the current one finishes) — each race has its own independent
// start timestamp.
// Race check in, done at the start line (Starter page) or by the Tower
// from a radio call. Three states per lane: 'present', 'absent', or absent
// from the object entirely = unknown. Only an explicit 'absent' turns into
// a DNS at start — never assume a lane is empty just because nobody
// ticked it, since the Tower may be starting as a fallback with no check
// in done at all.
router.post('/:id/check-in', (req, res) => {
  const database = db.load();
  const race = database.races[req.params.id];
  if (!race) return res.status(404).json({ error: 'Race not found' });
  race.checkIn = race.checkIn || { lanes: {}, note: '' };
  if (req.body.lane !== undefined) {
    const lane = String(req.body.lane);
    const state = req.body.state;
    if (state === 'present' || state === 'absent') race.checkIn.lanes[lane] = state;
    else delete race.checkIn.lanes[lane]; // back to unknown
  }
  if (req.body.note !== undefined) race.checkIn.note = String(req.body.note || '').slice(0, 300);
  race.checkIn.updatedAt = Date.now();
  db.save();
  res.json(enrichRace(database, race));
});

router.post('/:id/start', (req, res) => {
  const database = db.load();
  const race = database.races[req.params.id];
  if (!race) return res.status(404).json({ error: 'Race not found' });
  if (race.status === 'finished') return res.status(400).json({ error: 'Race is already finished.' });
  // Idempotent: if the Starter and the Tower both press Start, the first
  // one wins and the second gets the running race back rather than an error.
  if (race.status === 'running') return res.json(enrichRace(database, race));

  race.status = 'running';
  race.startTimeMs = Date.now();
  race.stopTimeMs = null;

  // Apply check in: anyone explicitly marked absent is DNS (ICF 10.2.14/15).
  const marked = (race.checkIn && race.checkIn.lanes) || {};
  database.raceResults[race.id] = database.raceResults[race.id] || {};
  Object.entries(marked).forEach(([lane, state]) => {
    if (state !== 'absent') return;
    const entryId = race.lanes[lane];
    if (!entryId) return;
    database.raceResults[race.id][entryId] = {
      finishTimeMs: null, position: 0, status: 'DNS',
      dqReason: 'Not at the start (ICF 10.2.14)', crossedAt: Date.now(),
    };
  });

  db.save();
  res.json(enrichRace(database, race));
});

// Recall a started race (ICF 10.2.9-10.2.13). Two kinds:
//   reason 'false-start' + lane  → that boat gets a warning (10.2.10);
//                                  its SECOND warning is an automatic DSQ
//                                  from this race (10.2.11).
//   reason 'no-fault'            → equipment malfunction or other
//                                  unforeseen circumstance, nobody is
//                                  warned (10.2.12/10.2.13).
// Either way the clock resets and the race goes back to pending so the
// Starter can run the sequence again. Crossings are wiped; DNS marks from
// check in are kept, since those boats are still not there.
router.post('/:id/recall', (req, res) => {
  const database = db.load();
  const race = database.races[req.params.id];
  if (!race) return res.status(404).json({ error: 'Race not found' });
  if (race.status !== 'running') return res.status(400).json({ error: 'That race is not running.' });

  const reason = req.body.reason === 'false-start' ? 'false-start' : 'no-fault';
  const lane = req.body.lane != null ? String(req.body.lane) : null;
  if (reason === 'false-start' && !lane) return res.status(400).json({ error: 'A false start needs the offending lane.' });

  race.falseStartWarnings = race.falseStartWarnings || {};
  race.recalls = race.recalls || [];

  let disqualified = null;
  if (reason === 'false-start') {
    const entryId = race.lanes[lane];
    if (!entryId) return res.status(400).json({ error: `No boat in lane ${lane}.` });
    const priorWarnings = race.falseStartWarnings[lane] || 0;
    race.falseStartWarnings[lane] = priorWarnings + 1;
    if (priorWarnings >= 1) {
      // Second false start by the same crew — DSQ is mandatory, not a choice.
      database.raceResults[race.id] = database.raceResults[race.id] || {};
      database.raceResults[race.id][entryId] = {
        finishTimeMs: null, position: 0, status: 'DQ',
        dqReason: 'Second false start (ICF 10.2.11)', crossedAt: Date.now(),
      };
      disqualified = lane;
    }
  }

  race.recalls.push({ at: Date.now(), reason, lane, disqualified: !!disqualified });

  // Reset for the new start
  race.status = 'pending';
  race.startTimeMs = null;
  race.stopTimeMs = null;
  database.blindCrossings[race.id] = [];
  // Keep DNS/DQ marks, drop any timed results from the aborted start
  const results = database.raceResults[race.id] || {};
  Object.entries(results).forEach(([entryId, r]) => { if (r.status === 'OK') delete results[entryId]; });

  db.save();
  res.json({ ok: true, reason, lane, disqualified, warnings: race.falseStartWarnings, race: enrichRace(database, race) });
});

router.post('/:id/capture-crossing', (req, res) => {
  const database = db.load();
  const race = database.races[req.params.id];
  if (!race) return res.status(404).json({ error: 'Race not found' });
  if (race.isMassStart) return res.status(400).json({ error: 'Mass-start races use slide-number entry instead.' });
  if (race.status !== 'running') return res.status(400).json({ error: 'Race is not running' });
  database.blindCrossings[race.id] = database.blindCrossings[race.id] || [];
  const list = database.blindCrossings[race.id];
  const crossing = { position: list.length + 1, timeMs: Date.now() - race.startTimeMs, assignedLane: null };
  list.push(crossing);
  db.save();
  res.json(enrichRace(database, race));
});

// Removes the most recently CAPTURED crossing (last in the list), even if
// it had already been assigned a lane — undoes that assignment's result
// too, since "undo last crossing" means undo the last button press.
// Unassign a crossing's lane but KEEP the crossing and its time — for
// fixing a wrong lane entry without losing the recorded time.
router.post('/:id/unassign-crossing', (req, res) => {
  const database = db.load();
  const race = database.races[req.params.id];
  if (!race) return res.status(404).json({ error: 'Race not found' });
  const position = Number(req.body.position);
  const list = database.blindCrossings[race.id] || [];
  const crossing = list.find((c) => c.position === position);
  if (!crossing) return res.status(404).json({ error: 'Crossing not found' });
  if (crossing.assignedLane != null) {
    const entryId = race.lanes[String(crossing.assignedLane)];
    if (entryId && database.raceResults[race.id]) {
      delete database.raceResults[race.id][entryId];
    }
    crossing.assignedLane = null;
  }
  // Recompute positions for remaining OK results
  if (database.raceResults[race.id]) {
    recomputePositions(database.raceResults[race.id]);
  }
  db.save();
  res.json({ ok: true });
});

// Delete a specific crossing by position number (not just the last one).
router.post('/:id/delete-crossing', (req, res) => {
  const database = db.load();
  const race = database.races[req.params.id];
  if (!race) return res.status(404).json({ error: 'Race not found' });
  const position = Number(req.body.position);
  const list = database.blindCrossings[race.id] || [];
  const idx = list.findIndex((c) => c.position === position);
  if (idx === -1) return res.status(404).json({ error: 'Crossing not found' });
  const removed = list.splice(idx, 1)[0];
  // Clear the result if it was already assigned
  if (removed.assignedLane != null) {
    const entryId = race.lanes[String(removed.assignedLane)];
    if (entryId && database.raceResults[race.id]) {
      delete database.raceResults[race.id][entryId];
    }
  }
  // Renumber remaining crossings sequentially
  list.forEach((c, i) => { c.position = i + 1; });
  // Recompute positions for remaining OK results
  if (database.raceResults[race.id]) {
    recomputePositions(database.raceResults[race.id]);
  }
  db.save();
  res.json(enrichRace(database, race));
});

router.post('/:id/undo-crossing', (req, res) => {
  const database = db.load();
  const race = database.races[req.params.id];
  if (!race) return res.status(404).json({ error: 'Race not found' });
  const list = database.blindCrossings[race.id] || [];
  const last = list.pop();
  if (last && last.assignedLane != null) {
    const entryId = race.lanes[String(last.assignedLane)];
    if (entryId && database.raceResults[race.id]) {
      delete database.raceResults[race.id][entryId];
      recomputePositions(database.raceResults[race.id]);
    }
  }
  db.save();
  res.json(enrichRace(database, race));
});

// Attach a captured crossing to a lane, at whatever pace is safe after
// the chaos of the finish. Overwriting a crossing's previous assignment
// (typo correction) is allowed — clears the old result first. Once only
// one real lane and one crossing are left unmatched, they're auto-paired
// (unambiguous at that point) so the last one doesn't need typing.
router.post('/:id/assign-crossing', (req, res) => {
  const database = db.load();
  const race = database.races[req.params.id];
  if (!race) return res.status(404).json({ error: 'Race not found' });
  const { position, lane } = req.body;
  const list = database.blindCrossings[race.id] || [];
  const crossing = list.find((c) => c.position === Number(position));
  if (!crossing) return res.status(404).json({ error: `No crossing #${position}.` });
  const entryId = race.lanes[String(lane)];
  if (!entryId) return res.status(400).json({ error: `No boat assigned to lane ${lane}.` });

  database.raceResults[race.id] = database.raceResults[race.id] || {};
  const results = database.raceResults[race.id];

  // A boat already marked DNS or DQ must not silently pick up a time —
  // a second false start (ICF 10.2.11) or a no-show is a deliberate
  // decision, so an accidental lane keystroke shouldn't undo it. Clear
  // the existing result first if the mark really was wrong.
  const existing = results[entryId];
  if (existing && existing.status !== 'OK') {
    return res.status(409).json({
      error: `Lane ${lane} is marked ${existing.status}${existing.dqReason ? ` — ${existing.dqReason}` : ''}. Clear that result first if it was wrong.`,
    });
  }

  // If target lane already has a crossing assigned, unassign it first
  const alreadyTaken = list.find((c) => c.assignedLane === Number(lane) && c.position !== crossing.position);
  if (alreadyTaken) {
    const oldEntryId = race.lanes[String(alreadyTaken.assignedLane)];
    if (oldEntryId) delete results[oldEntryId];
    alreadyTaken.assignedLane = null;
  }

  // If this crossing was previously assigned elsewhere, undo that first
  if (crossing.assignedLane != null) {
    const oldEntryId = race.lanes[String(crossing.assignedLane)];
    if (oldEntryId) delete results[oldEntryId];
  }

  crossing.assignedLane = Number(lane);
  results[entryId] = { finishTimeMs: crossing.timeMs, position: crossing.position, status: 'OK', dqReason: null, crossedAt: Date.now() };

  autoAssignLastRemaining(database, race, list, results);

  // Recompute positions by finish time
  recomputePositions(results);

  db.save();
  res.json(enrichRace(database, race));
});

function autoAssignLastRemaining(database, race, list, results) {
  const realLanes = Object.entries(race.lanes).filter(([, eid]) => eid);
  // Skip any lane that already has a result of any kind — an OK time, or
  // a DNS/DQ. Only genuinely unresolved lanes are candidates.
  const unassignedLanes = realLanes.filter(([lane]) => !results[race.lanes[lane]]);
  const unassignedCrossings = list.filter((c) => c.assignedLane == null);
  if (unassignedLanes.length === 1 && unassignedCrossings.length === 1) {
    const [lane, entryId] = unassignedLanes[0];
    const crossing = unassignedCrossings[0];
    crossing.assignedLane = Number(lane);
    results[entryId] = { finishTimeMs: crossing.timeMs, position: crossing.position, status: 'OK', dqReason: null, crossedAt: Date.now() };
  }
}

router.post('/:id/undo/:entryId', (req, res) => {
  const database = db.load();
  const race = database.races[req.params.id];
  if (!race) return res.status(404).json({ error: 'Race not found' });
  const results = database.raceResults[race.id] || {};
  delete results[req.params.entryId];
  recomputePositions(results);
  db.save();
  res.json(enrichRace(database, race));
});

// Mark (or re-mark) an entry's result directly — DNS (did not start), DNF
// (did not finish), or DQ (disqualified, with an optional reason). Works
// whether this entry has no result yet (the original use case — an
// unresolved lane) OR already has a real timed finish, so a boat can be
// corrected/DQ'd after the fact, before it moves on to weigh-in or
// results get confirmed. DQ keeps the existing finish time on the record
// (useful for reference) but — same as OK -> DNS/DNF — drops it out of
// the ranked position sequence, which gets renumbered so undoing/
// re-marking one entry never leaves a gap. If this race's results were
// already marked official, changing one now un-confirms it, same as the
// automatic weigh-in DQ path below.
router.post('/:id/mark/:entryId', (req, res) => {
  const database = db.load();
  const race = database.races[req.params.id];
  if (!race) return res.status(404).json({ error: 'Race not found' });
  const { status, dqReason } = req.body;
  if (!['DNS', 'DNF', 'DQ'].includes(status)) return res.status(400).json({ error: 'status must be DNS, DNF, or DQ' });
  database.raceResults[race.id] = database.raceResults[race.id] || {};
  const existing = database.raceResults[race.id][req.params.entryId];
  const keepTiming = status === 'DQ' && existing && existing.status === 'OK';
  database.raceResults[race.id][req.params.entryId] = {
    finishTimeMs: keepTiming ? existing.finishTimeMs : null,
    position: null,
    status,
    dqReason: status === 'DQ' ? (dqReason || null) : null,
    crossedAt: keepTiming ? existing.crossedAt : Date.now(),
  };
  recomputePositions(database.raceResults[race.id]);
  if (race.resultsConfirmed) race.resultsConfirmed = false;
  db.save();
  res.json(enrichRace(database, race));
});

// Stop the clock — freezes the elapsed time display without locking results.
// The race stays 'running' so crossings can still be assigned afterward.
// Restart the clock — clears stopTimeMs so the clock runs again.
// Use when Stop was hit by mistake before boats finished.
router.post('/:id/restart-clock', (req, res) => {
  const database = db.load();
  const race = database.races[req.params.id];
  if (!race) return res.status(404).json({ error: 'Race not found.' });
  if (race.status !== 'running') return res.status(400).json({ error: 'Race is not running.' });
  race.stopTimeMs = null;
  race.startTimeMs = Date.now(); // reset to zero
  // Clear any existing crossings so the timing starts fresh
  database.blindCrossings[race.id] = [];
  database.raceResults[race.id] = {};
  db.save();
  res.json({ ok: true });
});

// Manual time override — for photo finish corrections. Sets the finish
// time for a lane directly (mm:ss.cc or seconds), then recomputes all
// positions including dead heats. Un-confirms an already-official race.
router.post('/:id/set-time/:entryId', (req, res) => {
  const database = db.load();
  const race = database.races[req.params.id];
  if (!race) return res.status(404).json({ error: 'Race not found' });
  const { timeMs } = req.body;
  if (typeof timeMs !== 'number' || timeMs < 0) return res.status(400).json({ error: 'timeMs (number) required' });
  database.raceResults[race.id] = database.raceResults[race.id] || {};
  const results = database.raceResults[race.id];
  const existing = results[req.params.entryId];
  results[req.params.entryId] = {
    finishTimeMs: timeMs,
    position: existing ? existing.position : 0,
    status: 'OK',
    dqReason: null,
    crossedAt: existing ? existing.crossedAt : Date.now(),
    manualTime: true,
  };
  recomputePositions(results);
  if (race.resultsConfirmed) race.resultsConfirmed = false;
  db.save();
  res.json(enrichRace(database, race));
});

router.post('/:id/stop-clock', (req, res) => {
  const database = db.load();
  const race = database.races[req.params.id];
  if (!race) return res.status(404).json({ error: 'Race not found.' });
  if (race.status !== 'running') return res.status(400).json({ error: 'Race is not running.' });
  race.stopTimeMs = Date.now();
  db.save();
  res.json({ ok: true, stopTimeMs: race.stopTimeMs });
});

router.post('/:id/finish-race', async (req, res) => {
  const database = db.load();
  const race = database.races[req.params.id];
  if (!race) return res.status(404).json({ error: 'Race not found' });

  // Hard block, not just a warning: every lane/bib with a real boat needs
  // a result (a captured/assigned crossing, a completed lap count, or an
  // explicit DNS/DNF/DQ mark) before this race can close. This is the
  // direct fix for races locking with zero results recorded — there's no
  // "lock anyway" escape hatch anymore, since that's exactly what caused
  // it. Used to exempt mass-start races (no way to resolve a boat that
  // never finished its laps) — now that DNS/DNF/DQ marking works for them
  // too (see /mark/:entryId above), they get the same check.
  {
    const results = database.raceResults[race.id] || {};
    const realLanes = Object.entries(race.lanes).filter(([, entryId]) => {
      if (!entryId) return false;
      const entry = database.entries[entryId];
      return !entry || entry.status !== 'scratched'; // exclude scratched
    });
    const unresolved = realLanes.filter(([, entryId]) => !results[entryId]);
    if (unresolved.length > 0) {
      const noun = race.isMassStart ? 'slide' : 'lane';
      return res.status(400).json({
        error: `${unresolved.length} ${noun}(s) still have no result — ${race.isMassStart ? 'mark them DNS/DNF/DQ' : 'assign their crossing, or mark them DNS/DNF'}, before this race can close.`,
        unresolvedLanes: unresolved.map(([lane]) => Number(lane)),
      });
    }
  }

  race.status = 'finished';
  race.resultsConfirmed = false; // provisional until weigh-ins are done and office confirms
  race.finishedAt = Date.now();
  // Snapshot conditions at lock time. Never blocks: a failed fetch just
  // leaves conditions null and the office can add them by hand later.
  {
    const event = database.events[race.eventId];
    const meet = event && database.meets[event.meetId];
    const venue = meet && meet.venueId ? VENUES[meet.venueId] : null;
    if (venue) {
      const w = await fetchConditions(venue, meet.courseBearing);
      if (w) race.conditions = w;
    }
  }
  const advanced = progression.autoAdvance(database, race.eventId);
  db.save();
  res.json({ ...enrichRace(database, race), advanced });
});

// Recovery path: a race got locked as finished before every lane/crossing
// was actually resolved (e.g. hit "End race" too early during blind
// capture). This puts it back to 'running' — startTimeMs is untouched, so
// already-captured crossings and their elapsed times stay valid, and it
// reappears on the Tower exactly where you left off, ready to finish
// assigning lanes properly. Existing results/crossings are NOT cleared.
//
// If finishing this race prematurely already triggered the NEXT round to
// auto-create/fill with incomplete data, that gets reverted too (back to
// an empty placeholder, same as it looked right after drawing) — but only
// if that next race hasn't started yet itself. Otherwise completing this
// race properly and re-finishing it wouldn't recompute the next round
// correctly, since it would already look "filled."
router.post('/:id/reopen', (req, res) => {
  const database = db.load();
  const race = database.races[req.params.id];
  if (!race) return res.status(404).json({ error: 'Race not found' });
  if (race.status !== 'finished') return res.status(400).json({ error: 'Only a finished race can be reopened.' });
  race.status = 'running';
  race.finishedAt = null;

  const event = database.events[race.eventId];
  const nextPhaseMap = { heat: 'semi', semi: 'final' };
  const nextPhase = nextPhaseMap[race.phase];
  if (event && nextPhase) {
    const meet = database.meets[event.meetId];
    const meetLanes = (meet && meet.lanes) || rules.DEFAULT_LANES;
    Object.values(database.races).forEach((r) => {
      if (r.eventId !== race.eventId) return;
      const isNextPhase = nextPhase === 'semi' ? r.phase === 'semi' : (r.phase === 'final' || r.phase === 'finalB' || r.phase === 'finalC');
      if (isNextPhase && r.status === 'pending' && !r.placeholder) {
        const emptyLanes = {};
        for (let i = 1; i <= meetLanes; i++) emptyLanes[i] = null;
        r.lanes = emptyLanes;
        r.placeholder = true;
      }
    });
  }

  db.save();
  res.json(enrichRace(database, race));
});

// Race office marks results official once weigh-ins are done and no more
// changes are expected. The Live Board shows "provisional" vs "official"
// based on this. A later DQ (see /entries/:entryId/weigh below) on an
// already-confirmed race automatically flips this back to provisional —
// safety net so a late weigh-in never silently sits behind a stale
// "official" badge.
router.post('/:id/confirm-results', (req, res) => {
  const database = db.load();
  const race = database.races[req.params.id];
  if (!race) return res.status(404).json({ error: 'Race not found' });
  if (race.status !== 'finished') return res.status(400).json({ error: 'Race hasn\'t finished yet.' });
  race.resultsConfirmed = true;
  db.save();
  res.json(enrichRace(database, race));
});

router.post('/:id/unconfirm-results', (req, res) => {
  const database = db.load();
  const race = database.races[req.params.id];
  if (!race) return res.status(404).json({ error: 'Race not found' });
  race.resultsConfirmed = false;
  db.save();
  res.json(enrichRace(database, race));
});

// --- Editing a draw before it runs (Race Office "Override" tools) -----

// Swap two boats' lanes within a race. Only makes sense before the race
// has started — after that, times are already tied to specific lanes.
router.post('/:id/swap-lanes', (req, res) => {
  const database = db.load();
  const race = database.races[req.params.id];
  if (!race) return res.status(404).json({ error: 'Race not found' });
  if (race.status !== 'pending') return res.status(400).json({ error: 'Can only edit lanes before the race starts.' });
  const { laneA, laneB } = req.body;
  const a = String(laneA), b = String(laneB);
  const tmp = race.lanes[a] ?? null;
  race.lanes[a] = race.lanes[b] ?? null;
  race.lanes[b] = tmp;
  db.save();
  res.json(enrichRace(database, race));
});

// Remove a boat from just this one race (frees the lane) without
// affecting their entry elsewhere. Use this when a crew scratches from a
// specific heat but might still be reassigned, or as part of a manual fix.
router.post('/:id/scratch-lane/:lane', (req, res) => {
  const database = db.load();
  const race = database.races[req.params.id];
  if (!race) return res.status(404).json({ error: 'Race not found' });
  if (race.status !== 'pending') return res.status(400).json({ error: 'Can only edit lanes before the race starts.' });
  race.lanes[req.params.lane] = null;
  db.save();
  res.json(enrichRace(database, race));
});
router.patch('/:id/schedule', (req, res) => {
  const database = db.load();
  const race = database.races[req.params.id];
  if (!race) return res.status(404).json({ error: 'Race not found' });
  race.scheduledLabel = req.body.scheduledLabel || null;
  db.save();
  res.json(enrichRace(database, race));
});

// Delete a race outright — used before starting, e.g. to redraw an event
// from scratch after entries changed.
router.delete('/:id', (req, res) => {
  const database = db.load();
  const race = database.races[req.params.id];
  if (!race) return res.status(404).json({ error: 'Race not found' });
  if (race.status !== 'pending') return res.status(400).json({ error: 'Can only delete a race that has not started.' });
  const involvedEventIds = race.combinedEventIds && race.combinedEventIds.length > 1 ? race.combinedEventIds : [race.eventId];
  involvedEventIds.forEach((id) => { const ev = database.events[id]; if (ev) ev.drawConfirmed = false; });
  delete database.races[race.id];
  delete database.raceResults[race.id];
  db.save();
  res.json({ deleted: race.id });
});

router.delete('/entries/:entryId', (req, res) => {
  const database = db.load();
  const entry = database.entries[req.params.entryId];
  if (!entry) return res.status(404).json({ error: 'Entry not found' });
  const lockedRace = Object.values(database.races).find((r) =>
    (r.eventId === entry.eventId || (r.combinedEventIds || []).includes(entry.eventId)) &&
    r.status !== 'pending' && Object.values(r.lanes).includes(entry.id)
  );
  if (lockedRace) return res.status(400).json({ error: 'This entry is in a race that has already started or finished — can\'t delete it now. Scratch it instead if they withdrew.' });

  // Same as move-event: if they're in a DRAWN (but not started) race,
  // undo that whole draw rather than leaving a stale gap with no signal
  // that a redraw is needed.
  const affectedRaces = Object.values(database.races).filter((race) =>
    (race.eventId === entry.eventId || (race.combinedEventIds || []).includes(entry.eventId)) &&
    race.status === 'pending' && Object.values(race.lanes).includes(entry.id)
  );
  const undoneEventLabels = new Set();
  affectedRaces.forEach((race) => {
    const involvedEventIds = race.combinedEventIds && race.combinedEventIds.length > 1 ? race.combinedEventIds : [race.eventId];
    involvedEventIds.forEach((id) => {
      const ev = database.events[id];
      if (ev) { ev.drawConfirmed = false; undoneEventLabels.add(ev.label); }
    });
    delete database.races[race.id];
    delete database.raceResults[race.id];
  });

  delete database.entries[entry.id];
  db.save();
  res.json({ deleted: entry.id, undoneDraws: [...undoneEventLabels] });
});

// --- Mass-start lap counting (2000m/5000m) ------------------------------
// Tower operator types/taps a BIB number each time that boat passes the
// counting point. This logs one lap pass; once a boat reaches totalLaps,
// it's automatically finished with position/time set — same result shape
// as a lane race, so results.js and the PDF export work unchanged.

// Quick fixes for a mass-start race that don't need the whole race torn
// down and redrawn — the equivalent of editing a lane number for a
// lane-based race. Grouping changes (who's combined with whom) still
// need Race Sort; these two are just "renumber a board" / "wrong lap
// count typed in."
router.post('/:id/rename-slide', (req, res) => {
  const database = db.load();
  const race = database.races[req.params.id];
  if (!race) return res.status(404).json({ error: 'Race not found' });
  if (race.status !== 'pending') return res.status(400).json({ error: 'Can only renumber a slide before the race starts.' });
  const { oldSlide, newSlide } = req.body;
  const oldKey = String(oldSlide), newKey = String(newSlide);
  if (!race.lanes[oldKey]) return res.status(400).json({ error: `No boat on slide ${oldSlide}.` });
  if (race.lanes[newKey]) return res.status(400).json({ error: `Slide ${newSlide} is already taken.` });
  const entryId = race.lanes[oldKey];
  delete race.lanes[oldKey];
  race.lanes[newKey] = entryId;
  const entry = database.entries[entryId];
  if (entry) entry.boatNumber = Number(newSlide);
  db.save();
  res.json(enrichRace(database, race));
});

router.patch('/:id/laps', (req, res) => {
  const database = db.load();
  const race = database.races[req.params.id];
  if (!race) return res.status(404).json({ error: 'Race not found' });
  if (!race.isMassStart) return res.status(400).json({ error: 'Not a mass-start race.' });
  if (race.status !== 'pending') return res.status(400).json({ error: 'Can only change lap count before the race starts.' });
  const totalLaps = Number(req.body.totalLaps);
  if (!Number.isInteger(totalLaps) || totalLaps < 1) return res.status(400).json({ error: 'totalLaps must be a positive whole number.' });
  race.totalLaps = totalLaps;
  db.save();
  res.json(enrichRace(database, race));
});
router.post('/:id/lap-pass', (req, res) => {
  const database = db.load();
  const race = database.races[req.params.id];
  if (!race) return res.status(404).json({ error: 'Race not found' });
  if (!race.isMassStart) return res.status(400).json({ error: 'This race doesn\'t use lap counting.' });
  if (race.status !== 'running') return res.status(400).json({ error: 'Race is not running' });
  const bib = String(req.body.bib);
  const entryId = race.lanes[bib];
  if (!entryId) return res.status(400).json({ error: `No boat is wearing slide ${bib} in this race.` });

  database.lapPasses[race.id] = database.lapPasses[race.id] || {};
  const passes = database.lapPasses[race.id][entryId] || [];
  if (passes.length >= race.totalLaps) return res.status(400).json({ error: `Slide ${bib} has already completed all ${race.totalLaps} laps.` });

  const timeMs = Date.now() - race.startTimeMs;
  passes.push({ lap: passes.length + 1, timeMs });
  database.lapPasses[race.id][entryId] = passes;

  if (passes.length === race.totalLaps) {
    database.raceResults[race.id] = database.raceResults[race.id] || {};
    const finishedCount = Object.values(database.raceResults[race.id]).filter((r) => r.status === 'OK').length;
    database.raceResults[race.id][entryId] = { finishTimeMs: timeMs, position: finishedCount + 1, status: 'OK', dqReason: null, crossedAt: Date.now() };
  }

  db.save();
  res.json(enrichRace(database, race));
});

router.post('/:id/undo-lap/:bib', (req, res) => {
  const database = db.load();
  const race = database.races[req.params.id];
  if (!race) return res.status(404).json({ error: 'Race not found' });
  const entryId = race.lanes[req.params.bib];
  if (!entryId) return res.status(400).json({ error: 'Unknown slide number for this race.' });
  const passes = (database.lapPasses[race.id] || {})[entryId] || [];
  passes.pop();
  database.lapPasses[race.id][entryId] = passes;
  // If they'd already been marked finished, undo that too and renumber.
  const results = database.raceResults[race.id] || {};
  if (results[entryId]) {
    delete results[entryId];
    const remaining = Object.entries(results).filter(([, r]) => r.status === 'OK')
      .sort((a, b) => a[1].finishTimeMs - b[1].finishTimeMs);
    remaining.forEach(([, r], i) => { r.position = i + 1; });
  }
  db.save();
  res.json(enrichRace(database, race));
});

// Per the club's actual process: weighing happens AFTER a boat finishes.
// A fail here doesn't block anything retroactively except the result —
// it flips that entry's status to DQ and results.js recomputes standings.
router.post('/entries/:entryId/weigh', (req, res) => {
  const database = db.load();
  const entry = database.entries[req.params.entryId];
  if (!entry) return res.status(404).json({ error: 'Entry not found' });
  const event = database.events[entry.eventId];
  const { weightKg } = req.body;
  if (typeof weightKg !== 'number') return res.status(400).json({ error: 'weightKg (number) required' });

  const check = rules.checkWeight(event.boatClass, weightKg);
  // Store per-race weigh-in (keyed raceId:entryId) AND global (for backward compat)
  // Find which race this entry is currently in (most recent finished race)
  const raceForEntry = Object.values(database.races)
    .filter(r => r.status === 'finished' && Object.values(r.lanes||{}).includes(entry.id))
    .sort((a,b) => (b.finishedAt||0) - (a.finishedAt||0))[0];

  const weighInData = { weightKg, timestamp: Date.now(), ...check };
  database.weighIns[entry.id] = weighInData; // global (backward compat)
  if (raceForEntry) {
    if (!database.raceWeighIns) database.raceWeighIns = {};
    database.raceWeighIns[`${raceForEntry.id}:${entry.id}`] = weighInData;
  }

  if (check.checked && !check.passed) {
    Object.entries(database.raceResults).forEach(([raceId, raceResultMap]) => {
      if (raceResultMap[entry.id]) {
        raceResultMap[entry.id].status = 'DQ';
        raceResultMap[entry.id].dqReason = check.dqReason;
        const race = database.races[raceId];
        if (race && race.resultsConfirmed) race.resultsConfirmed = false;
      }
    });
  }

  // Auto-confirm when 3 weigh-ins done for the race (per-race or global fallback)
  Object.values(database.races).forEach(race => {
    if (race.status !== 'finished' || race.resultsConfirmed) return;
    const allEntryIds = Object.values(race.lanes || {}).filter(Boolean);
    const hasPerRace = database.raceWeighIns && allEntryIds.some(id => database.raceWeighIns[`${race.id}:${id}`]);
    const weighedCount = allEntryIds.filter(id => {
      if (hasPerRace) return !!(database.raceWeighIns && database.raceWeighIns[`${race.id}:${id}`]);
      return !!(database.weighIns && database.weighIns[id]);
    }).length;
    const required = Math.min(3, allEntryIds.length);
    if (weighedCount >= required) race.resultsConfirmed = true;
  });

  db.save();
  res.json({ entry, weighIn: weighInData });
});

// Set which day a race runs on (for multi-day meets).
router.patch('/:id/day', (req, res) => {
  const database = db.load();
  const race = database.races[req.params.id];
  if (!race) return res.status(404).json({ error: 'Race not found.' });
  const day = Number(req.body.day);
  if (!Number.isInteger(day) || day < 1) return res.status(400).json({ error: 'day must be a positive number.' });
  race.day = day;

  // Find the meet so we can renumber all its pending races
  const event = database.events[race.eventId];
  const meetId = event && event.meetId;
  if (meetId) {
    const eventIds = new Set(
      Object.values(database.events).filter((e) => e.meetId === meetId).map((e) => e.id)
    );
    const locked = Object.values(database.races)
      .filter((r) => eventIds.has(r.eventId) && r.status !== 'pending');
    const pending = Object.values(database.races)
      .filter((r) => eventIds.has(r.eventId) && r.status === 'pending');

    const maxLocked = locked.reduce((m, r) => Math.max(m, r.raceNumber), 0);

    // Sort pending by day then current race number, then reassign sequentially
    pending
      .sort((a, b) => {
        const da = a.day || 1, db = b.day || 1;
        if (da !== db) return da - db;
        return a.raceNumber - b.raceNumber;
      })
      .forEach((r, i) => { r.raceNumber = maxLocked + i + 1; });
  }

  db.save();
  res.json({ ok: true });
});

// Swap two lanes within the same race.
router.post('/:id/swap-lanes', (req, res) => {
  const database = db.load();
  const race = database.races[req.params.id];
  if (!race) return res.status(404).json({ error: 'Race not found.' });
  if (race.status !== 'pending') return res.status(400).json({ error: 'Can only swap lanes before the race starts.' });
  const { laneA, laneB } = req.body;
  const a = String(laneA), b = String(laneB);
  const tmp = race.lanes[a] || null;
  race.lanes[a] = race.lanes[b] || null;
  race.lanes[b] = tmp;
  db.save();
  res.json(enrichRace(database, race));
});

// Move a boat from one race to another — takes them out of their current
// lane and places them in the first empty lane of the target race.
router.post('/:id/move-to-race', (req, res) => {
  const database = db.load();
  const fromRace = database.races[req.params.id];
  if (!fromRace) return res.status(404).json({ error: 'Source race not found.' });
  if (fromRace.status !== 'pending') return res.status(400).json({ error: 'Can only move lanes before the race starts.' });

  const { entryId, targetRaceId } = req.body;
  const toRace = database.races[targetRaceId];
  if (!toRace) return res.status(404).json({ error: 'Target race not found.' });
  if (toRace.status !== 'pending') return res.status(400).json({ error: 'Target race has already started.' });

  // Remove from source race
  Object.keys(fromRace.lanes).forEach((l) => {
    if (fromRace.lanes[l] === entryId) fromRace.lanes[l] = null;
  });

  // Find first empty lane in target race
  const meet = database.meets[database.events[toRace.eventId] && database.events[toRace.eventId].meetId];
  const numLanes = meet ? (meet.lanes || 9) : 9;
  let placed = false;
  for (let l = 1; l <= numLanes; l++) {
    if (!toRace.lanes[String(l)]) {
      toRace.lanes[String(l)] = entryId;
      placed = true;
      break;
    }
  }
  if (!placed) return res.status(400).json({ error: 'No empty lanes in the target race.' });

  db.save();
  res.json({ ok: true });
});

// Reorder a race up or down in the running order (Tower use).
// Swaps raceNumbers with the adjacent race.
router.post('/:id/reorder', (req, res) => {
  const database = db.load();
  const race = database.races[req.params.id];
  if (!race) return res.status(404).json({ error: 'Race not found.' });
  if (race.status !== 'pending') return res.status(400).json({ error: 'Can only reorder pending races.' });
  const direction = req.body.direction; // 'up' or 'down'
  const event = database.events[race.eventId];
  if (!event) return res.status(404).json({ error: 'Event not found.' });
  const eventIds = new Set(Object.values(database.events).filter((e) => e.meetId === event.meetId).map((e) => e.id));
  const pending = Object.values(database.races)
    .filter((r) => eventIds.has(r.eventId) && r.status === 'pending')
    .sort((a, b) => a.raceNumber - b.raceNumber);
  const idx = pending.findIndex((r) => r.id === race.id);
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= pending.length) return res.status(400).json({ error: 'Already at the limit.' });
  const other = pending[swapIdx];
  const tmp = race.raceNumber;
  race.raceNumber = other.raceNumber;
  other.raceNumber = tmp;
  db.save();
  res.json({ ok: true });
});

module.exports = router;
