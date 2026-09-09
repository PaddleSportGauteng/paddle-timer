const express = require('express');
const db = require('../db');
const rules = require('../rules');
const { enrichRace, raceMatchesEvent, sortByScheduleThenNumber } = require('../present');

const router = express.Router();

function eventEntries(database, eventId) {
  return Object.values(database.entries).filter((e) => e.eventId === eventId && e.status === 'active');
}

function getMeetLanes(database, meetId) {
  const meet = database.meets[meetId];
  return (meet && meet.lanes) || rules.DEFAULT_LANES;
}

function autoCombinedLabel(events) {
  const first = events[0];
  const ages = events.map((e) => e.ageCategory);
  return `${first.distance} ${first.boatClass} ${ages.join('/')} ${first.gender}`;
}

function nextRaceNumber(database, meetId) {
  const meet = database.meets[meetId];
  const n = meet.nextRaceNumber || 1;
  meet.nextRaceNumber = n + 1;
  return n;
}

// List every event (for one meet) with its entry count and the format the rules engine decided.
// Events that are part of a combined race (see /combine/*) are consolidated
// into ONE row — the primary event — with a combinedLabel showing every
// category involved, rather than showing each original small category as
// its own separate (misleadingly "undrawn") row.
router.get('/events', (req, res) => {
  const database = db.load();
  const meetId = req.query.meetId;
  if (!meetId) return res.status(400).json({ error: 'meetId is required — pick a meet first.' });
  const dayFilter = req.query.day ? Number(req.query.day) : null;
  const meetLanes = getMeetLanes(database, meetId);

  // Map every event involved in a combined race to that race's primary event id.
  const combinedPrimaryFor = {}; // eventId -> primaryEventId
  const combinedMembersOf = {};  // primaryEventId -> [eventId, ...] (all members incl. primary)
  Object.values(database.races).forEach((r) => {
    if (r.combinedEventIds && r.combinedEventIds.length > 1) {
      const primary = r.combinedEventIds[0];
      r.combinedEventIds.forEach((id) => { combinedPrimaryFor[id] = primary; });
      combinedMembersOf[primary] = r.combinedEventIds;
    }
  });

  const events = Object.values(database.events)
    .filter((ev) => ev.meetId === meetId)
    .filter((ev) => !dayFilter || (ev.day || 1) === dayFilter);
  const out = [];
  events.forEach((ev) => {
    const primaryId = combinedPrimaryFor[ev.id];
    if (primaryId && primaryId !== ev.id) return; // non-primary member — absorbed into the primary's row below

    const memberIds = combinedMembersOf[ev.id] || [ev.id];
    const isCombined = memberIds.length > 1;
    const entries = memberIds.flatMap((id) => eventEntries(database, id));
    const hasRaces = Object.values(database.races).some((r) => raceMatchesEvent(r, ev.id));
    let combinedLabel = null;
    if (isCombined) {
      const race = Object.values(database.races).find((r) => raceMatchesEvent(r, ev.id));
      const customLabel = race && race.combinedLabel;
      if (customLabel) {
        combinedLabel = customLabel;
      } else {
        const memberEvents = memberIds.map((id) => database.events[id]).filter(Boolean);
        const ages = memberEvents.map((e) => e.ageCategory);
        combinedLabel = `${ev.distance} ${ev.boatClass} ${ages.join('/')} ${ev.gender}`;
      }
    }

    if (ev.isMassStart) {
      const bibsAssigned = entries.length > 0 && entries.every((e) => e.boatNumber);
      const format = entries.length < 3
        ? { runnable: false, reason: 'Fewer than 3 boats entered (ICF 5.1.1).', rounds: [] }
        : { runnable: true, rounds: ['mass'], note: 'Mass start — everyone races together, no heats. Assign bib numbers, then set lap count.' };
      out.push({ ...ev, entryCount: entries.length, format, hasRaces, bibsAssigned, isCombined, combinedLabel });
      return;
    }
    const format = rules.decideFormat(entries.length, meetLanes);
    out.push({ ...ev, entryCount: entries.length, format, hasRaces, isCombined, combinedLabel });
  });
  res.json(out);
});

// Distinct distance+boatClass combinations for this meet, with entry
// counts and current day assignment — the raw material for deciding
// "K1 1000m/500m/200m on day 1, K2 500m/200m on day 2" etc.
router.get('/day-groups', (req, res) => {
  const database = db.load();
  const meetId = req.query.meetId;
  if (!meetId) return res.status(400).json({ error: 'meetId is required — pick a meet first.' });
  const events = Object.values(database.events).filter((ev) => ev.meetId === meetId);
  const groups = {};
  events.forEach((ev) => {
    const key = `${ev.distance}|${ev.boatClass}`;
    if (!groups[key]) groups[key] = { distance: ev.distance, boatClass: ev.boatClass, isMassStart: ev.isMassStart, entryCount: 0, days: new Set() };
    groups[key].entryCount += eventEntries(database, ev.id).length;
    groups[key].days.add(ev.day || 1);
  });
  const out = Object.values(groups).map((g) => ({ ...g, days: [...g.days].sort((a, b) => a - b) }))
    .sort((a, b) => a.distance.localeCompare(b.distance) || a.boatClass.localeCompare(b.boatClass));
  res.json(out);
});

// Bulk-assign every event matching this distance+boatClass to a day.
router.post('/assign-day', (req, res) => {
  const database = db.load();
  const { meetId, distance, boatClass, day } = req.body;
  if (!meetId || !distance || !boatClass) return res.status(400).json({ error: 'meetId, distance, and boatClass are required.' });
  const dayNum = Number(day);
  if (!Number.isInteger(dayNum) || dayNum < 1) return res.status(400).json({ error: 'day must be a positive whole number.' });
  const meet = database.meets[meetId];
  if (meet && meet.numDays && dayNum > meet.numDays) {
    return res.status(400).json({ error: `This meet is only set up for ${meet.numDays} day(s) — change that in meet settings first if you need more.` });
  }
  let count = 0;
  Object.values(database.events).forEach((ev) => {
    if (ev.meetId === meetId && ev.distance === distance && ev.boatClass === boatClass) { ev.day = dayNum; count++; }
  });
  db.save();
  res.json({ updated: count });
});

// Shared by both move-event (pick any existing event) and move-distance
// (same category, different distance — see below): pulls the entry out
// of any not-yet-started race (undoing that whole draw, since it's now
// wrong), refuses if it's already racing/finished, then reassigns it.
function moveEntry(database, entry, newEvent) {
  const lockedRace = Object.values(database.races).find((r) => raceMatchesEvent(r, entry.eventId) && r.status !== 'pending' && Object.values(r.lanes).includes(entry.id));
  if (lockedRace) return { error: 'This entry is in a race that has already started or finished — can\'t move it now.' };

  const affectedRaces = Object.values(database.races).filter((race) =>
    raceMatchesEvent(race, entry.eventId) && race.status === 'pending' && Object.values(race.lanes).includes(entry.id)
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

  entry.eventId = newEvent.id;
  entry.boatNumber = null; // old event's slide/bib number (if any) no longer applies
  return { entry, movedTo: newEvent.label, undoneDraws: [...undoneEventLabels] };
}

// Fix a data-entry mistake — athlete entered the wrong event (e.g. 2000m
// instead of 5000m). Pulls them out of any not-yet-started race lane
// (same as a scratch) and reassigns which event they belong to. If the
// target event is already drawn, they show up as an available (unplaced)
// entry there — either redraw that event, or assign them to an empty
// lane manually in Race Program.
router.post('/entries/:entryId/move-event', (req, res) => {
  const database = db.load();
  const entry = database.entries[req.params.entryId];
  if (!entry) return res.status(404).json({ error: 'Entry not found' });
  const currentEvent = database.events[entry.eventId];
  const newEvent = database.events[req.body.newEventId];
  if (!newEvent) return res.status(404).json({ error: 'Target event not found' });
  if (!currentEvent || newEvent.meetId !== currentEvent.meetId) return res.status(400).json({ error: 'Can only move within the same meet.' });
  if (newEvent.id === entry.eventId) return res.status(400).json({ error: 'Already in that event.' });

  const result = moveEntry(database, entry, newEvent);
  if (result.error) return res.status(400).json({ error: result.error });
  db.save();
  res.json(result);
});

// The common case the card's own hint text describes: wrong DISTANCE,
// same category otherwise. Keeps the athlete's current boat class, age
// category and gender exactly as they are and only changes the distance
// — creating that event on the fly if this meet doesn't have one yet
// (e.g. nobody else happens to be entered at 5000m in this age group),
// rather than requiring the event to already exist before you can move
// into it.
router.post('/entries/:entryId/move-distance', (req, res) => {
  const database = db.load();
  const entry = database.entries[req.params.entryId];
  if (!entry) return res.status(404).json({ error: 'Entry not found' });
  const currentEvent = database.events[entry.eventId];
  if (!currentEvent) return res.status(400).json({ error: 'Current event not found.' });
  const newDistance = String(req.body.newDistance || '').trim();
  if (!newDistance) return res.status(400).json({ error: 'newDistance is required.' });
  if (newDistance === currentEvent.distance) return res.status(400).json({ error: 'Already at that distance.' });

  const eventKey = `${newDistance}|${currentEvent.boatClass}|${currentEvent.ageCategory}|${currentEvent.gender}`;
  let targetEvent = Object.values(database.events).find((ev) => ev.meetId === currentEvent.meetId && ev._key === eventKey);
  let createdEvent = false;
  if (!targetEvent) {
    const id = db.nextId();
    targetEvent = {
      id, meetId: currentEvent.meetId, _key: eventKey, distance: newDistance,
      boatClass: currentEvent.boatClass, ageCategory: currentEvent.ageCategory, gender: currentEvent.gender,
      label: `${newDistance} ${currentEvent.boatClass} ${currentEvent.ageCategory} ${currentEvent.gender}`,
      isMassStart: newDistance === '2000m' || newDistance === '5000m',
      day: currentEvent.day || 1,
    };
    database.events[id] = targetEvent;
    createdEvent = true;
  }

  const result = moveEntry(database, entry, targetEvent);
  if (result.error) return res.status(400).json({ error: result.error });
  db.save();
  res.json({ ...result, createdEvent });
});

router.get('/events/:id/races', (req, res) => {
  const database = db.load();
  const event = database.events[req.params.id];
  if (!event) return res.status(404).json({ error: 'Event not found' });
  const races = Object.values(database.races)
    .filter((r) => raceMatchesEvent(r, event.id))
    .sort((a, b) => a.raceNumber - b.raceNumber)
    .map((r) => enrichRace(database, r));
  res.json({ event, races });
});

// Every race across every event for a meet — the unified "Race Program"
// list: Race 1, Race 2, Race 3... in one running sequence, each labelled
// with its event so it's unambiguous which paddlers are in which race.
router.get('/races', (req, res) => {
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
    Object.values(database.races).filter((r) => eventIds.has(r.eventId))
  ).map((r) => ({ ...enrichRace(database, r), event: database.events[r.eventId] }));
  res.json(races);
});

// Merge two or more pending heats of the SAME event/phase into one race —
// e.g. after scratches leave two half-empty heats. Combines every occupied
// lane across the selected races into a single fresh draw and deletes the
// originals. Refuses if the combined count would exceed lane capacity.
router.post('/merge-races', (req, res) => {
  const database = db.load();
  const { raceIds } = req.body;
  if (!Array.isArray(raceIds) || raceIds.length < 2) return res.status(400).json({ error: 'Give at least 2 race IDs to merge.' });

  const races = raceIds.map((id) => database.races[id]);
  if (races.some((r) => !r)) return res.status(404).json({ error: 'One or more races not found.' });
  if (races.some((r) => r.status !== 'pending')) return res.status(400).json({ error: 'Can only merge races that have not started.' });
  const eventId = races[0].eventId;
  const phase = races[0].phase;
  if (races.some((r) => r.eventId !== eventId || r.phase !== phase)) {
    return res.status(400).json({ error: 'Can only merge races from the same event and round (e.g. two heats).' });
  }
  const meetLanes = getMeetLanes(database, database.events[eventId].meetId);

  const entryIds = [];
  races.forEach((r) => Object.values(r.lanes).forEach((eid) => { if (eid) entryIds.push(eid); }));
  if (entryIds.length > meetLanes) {
    return res.status(400).json({ error: `Combined that's ${entryIds.length} boats — more than ${meetLanes} lanes at this venue. Can't merge into one race.` });
  }

  const lanes = assignLanes(entryIds, meetLanes);

  const keepId = races[0].id; // reuse the first race's identity (and its race number), delete the rest
  races[0].lanes = lanes;
  races.slice(1).forEach((r) => { delete database.races[r.id]; delete database.raceResults[r.id]; });

  db.save();
  res.json(enrichRace(database, database.races[keepId]));
});

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function splitIntoHeats(entryIds, heatsNeeded) {
  // ICF 5.1.3: heats should be equal size, or max 1 extra boat in a heat.
  const shuffled = shuffle(entryIds);
  const heats = Array.from({ length: heatsNeeded }, () => []);
  shuffled.forEach((id, i) => heats[i % heatsNeeded].push(id));
  return heats;
}

function assignLanes(entryIds, numLanes) {
  const laneOrder = rules.centerOutLaneOrder(numLanes);
  const lanes = {};
  entryIds.forEach((id, i) => { lanes[laneOrder[i]] = id; });
  return lanes;
}

// Shared by both a normal single-event draw and a combined-group draw:
// given a pool of entries and the ICF plan for however many rounds they
// need, create the heat(s) now, plus empty PLACEHOLDER semi/final slots
// reserving their spot in the running order (see the big comment below).
// extra can carry { combinedEventIds, combinedLabel } for a combined
// group — every race created gets the same extra fields, so later lookups
// by eventId (which is always eventIds[0], the primary) find them all.
function createRacesForFormat(database, { entries, format, eventId, meetId, meetLanes, extra }) {
  const createdRaces = [];
  const fields = extra || {};

  if (format.rounds[0] === 'final' && format.heatsNeeded === 1) {
    const lanes = assignLanes(shuffle(entries), meetLanes);
    const raceId = db.nextId();
    database.races[raceId] = {
      id: raceId, eventId, phase: 'final', heatNumber: 1,
      raceNumber: nextRaceNumber(database, meetId), published: false,
      scheduledLabel: null, status: 'pending', startTimeMs: null, lanes, ...fields,
    };
    createdRaces.push(raceId);
    return createdRaces;
  }

  const heats = splitIntoHeats(entries, format.heatsNeeded);
  heats.forEach((heatEntries, i) => {
    const lanes = assignLanes(heatEntries, meetLanes);
    const raceId = db.nextId();
    database.races[raceId] = {
      id: raceId, eventId, phase: 'heat', heatNumber: i + 1,
      raceNumber: nextRaceNumber(database, meetId), published: false,
      scheduledLabel: null, status: 'pending', startTimeMs: null, lanes, ...fields,
    };
    createdRaces.push(raceId);
  });

  // Placeholder semi/final slots — empty lanes 1..venueLanes — created
  // NOW so the printed programme shows the full running order (heat,
  // heat, heat, semi, semi, final) with a reserved spot, even though we
  // don't know who qualifies yet. Real names fill in automatically once
  // heats finish (see progression.js) — same race object, same slot in
  // the running order, not a new one appended at the end.
  if (!format.unsupported && format.numSemis > 0) {
    const emptyLanes = () => { const l = {}; for (let i = 1; i <= meetLanes; i++) l[i] = null; return l; };
    for (let i = 1; i <= format.numSemis; i++) {
      const raceId = db.nextId();
      database.races[raceId] = {
        id: raceId, eventId, phase: 'semi', heatNumber: i,
        raceNumber: nextRaceNumber(database, meetId), published: false,
        scheduledLabel: null, status: 'pending', startTimeMs: null, lanes: emptyLanes(),
        placeholder: true, ...fields,
      };
      createdRaces.push(raceId);
    }
    const finalPhases = ['final', 'finalB', 'finalC'].slice(0, format.finalsNeeded || 1);
    finalPhases.forEach((phase) => {
      const raceId = db.nextId();
      database.races[raceId] = {
        id: raceId, eventId, phase, heatNumber: 1,
        raceNumber: nextRaceNumber(database, meetId), published: false,
        scheduledLabel: null, status: 'pending', startTimeMs: null, lanes: emptyLanes(),
        placeholder: true, ...fields,
      };
      createdRaces.push(raceId);
    });
  }
  return createdRaces;
}

// Generate races (heats and/or a straight final) for an event. New races
// are unpublished — they won't show up on the Tower until "Finalise" is
// hit, so the office can freely edit lanes, scratch, and merge first.
router.post('/events/:id/generate', (req, res) => {
  const database = db.load();
  const event = database.events[req.params.id];
  if (!event) return res.status(404).json({ error: 'Event not found' });
  if (event.isMassStart) return res.status(400).json({ error: 'This is a mass-start event — assign bibs and set laps instead of generating heats.' });
  const meet = database.meets[event.meetId];
  if (!meet) return res.status(400).json({ error: 'This event has no valid meet.' });

  const entries = eventEntries(database, event.id).map((e) => e.id);
  const meetLanes = getMeetLanes(database, event.meetId);
  const format = rules.decideFormat(entries.length, meetLanes);
  if (!format.runnable) return res.status(400).json({ error: format.reason });

  const existing = Object.values(database.races).filter((r) => r.eventId === event.id);
  if (existing.length) return res.status(400).json({ error: 'Races already generated for this event. Delete them first if you need to redraw.' });

  event.plan = format; // freeze the plan so later scratches don't change how many rounds we expect
  event.pendingDirectQualifiers = [];

  const createdRaces = createRacesForFormat(database, { entries, format, eventId: event.id, meetId: event.meetId, meetLanes });

  db.save();
  res.json({ createdRaces, format });
});

// Override for a category stuck below the ICF minimum with no combine
// partner available. Races it as a straight final regardless — flagged
// as overridden so it's visibly known, not silently missed.
router.post('/events/:id/force-final', (req, res) => {
  const database = db.load();
  const event = database.events[req.params.id];
  if (!event) return res.status(404).json({ error: 'Event not found' });
  if (event.isMassStart) return res.status(400).json({ error: 'Mass-start events use "Create race" instead.' });
  const meetLanes = getMeetLanes(database, event.meetId);
  const entries = eventEntries(database, event.id).map((e) => e.id);
  if (entries.length === 0) return res.status(400).json({ error: 'No active entries in this event.' });
  if (entries.length > meetLanes) return res.status(400).json({ error: `${entries.length} boats — more than ${meetLanes} lanes. Use Generate instead, this override is only for undersized fields.` });
  const existing = Object.values(database.races).filter((r) => r.eventId === event.id);
  if (existing.length) return res.status(400).json({ error: 'Races already generated for this event. Delete first if you need to redraw.' });

  event.plan = { runnable: true, rounds: ['final'], heatsNeeded: 1, note: 'Manually overridden below ICF minimum of 3 boats.' };
  const lanes = assignLanes(shuffle(entries), meetLanes);
  const raceId = db.nextId();
  database.races[raceId] = {
    id: raceId, eventId: event.id, phase: 'final', heatNumber: 1,
    raceNumber: nextRaceNumber(database, event.meetId), published: false,
    scheduledLabel: null, status: 'pending', startTimeMs: null, lanes,
    overridden: true,
  };
  db.save();
  res.json(enrichRace(database, database.races[raceId]));
});

// Office marks a drawn event as reviewed/good. "Change" (DELETE
// /api/races/:id) resets this automatically since the draw no longer exists.
router.post('/events/:id/confirm-draw', (req, res) => {
  const database = db.load();
  const event = database.events[req.params.id];
  if (!event) return res.status(404).json({ error: 'Event not found' });
  const hasRaces = Object.values(database.races).some((r) => raceMatchesEvent(r, event.id));
  if (!hasRaces) return res.status(400).json({ error: 'Nothing drawn for this event yet.' });
  event.drawConfirmed = true;
  db.save();
  res.json({ event });
});

// After a round finishes, this shows who's available to advance: every
// finisher from the current round's races, ranked by heat position then
// time, with the top `lanes` worth pre-suggested. No claim to exact ICF
// Appendix 1 qualifier rules here — it's a sensible default (fill by
// position across heats, break ties by time) that the office reviews and
// adjusts before creating the round, not an authoritative seeding.
router.get('/events/:id/next-round', (req, res) => {
  const database = db.load();
  const event = database.events[req.params.id];
  if (!event) return res.status(404).json({ error: 'Event not found' });

  const rounds = (event.plan && event.plan.rounds) || [];
  const eventRaces = Object.values(database.races).filter((r) => r.eventId === event.id);
  if (rounds.length < 2) return res.json({ available: false, reason: 'This event is a straight final — no further rounds.' });

  // Find the furthest phase that currently has races.
  let currentIndex = -1;
  rounds.forEach((phase, i) => { if (eventRaces.some((r) => r.phase === phase)) currentIndex = i; });
  if (currentIndex === -1) return res.json({ available: false, reason: 'No races drawn yet for this event.' });
  const currentPhase = rounds[currentIndex];
  const nextPhase = rounds[currentIndex + 1];
  if (!nextPhase) return res.json({ available: false, reason: `This event's final round (${currentPhase}) is already the last one planned.` });

  const currentRaces = eventRaces.filter((r) => r.phase === currentPhase);
  const unfinished = currentRaces.filter((r) => r.status !== 'finished');
  if (unfinished.length) {
    return res.json({ available: false, reason: `Waiting on ${unfinished.length} more ${currentPhase}(s) to finish before ${nextPhase} can be drawn.` });
  }

  const nextPhaseRaces = eventRaces.filter((r) => r.phase === nextPhase);
  const alreadyPlaced = new Set();
  nextPhaseRaces.forEach((r) => Object.values(r.lanes).forEach((eid) => { if (eid) alreadyPlaced.add(eid); }));

  let candidates = [];
  currentRaces.forEach((race) => {
    const results = database.raceResults[race.id] || {};
    Object.entries(results).forEach(([entryId, result]) => {
      if (result.status !== 'OK') return; // skip DNS/DNF/DQ
      if (alreadyPlaced.has(entryId)) return;
      const entry = database.entries[entryId];
      if (!entry || entry.status !== 'active') return;
      const names = entry.athleteIds.map((aid) => {
        const a = database.athletes[aid];
        return a ? `${a.firstName} ${a.surname || ''}`.trim() : '?';
      });
      candidates.push({
        entryId, names, heatNumber: race.heatNumber, position: result.position, finishTimeMs: result.finishTimeMs,
      });
    });
  });
  candidates.sort((a, b) => (a.position - b.position) || (a.finishTimeMs - b.finishTimeMs));
  const meetLanes = getMeetLanes(database, event.meetId);
  candidates = candidates.map((c, i) => ({ ...c, suggested: i < meetLanes }));

  res.json({ available: true, currentPhase, nextPhase, nextPhaseRaceCount: nextPhaseRaces.length, candidates });
});

// Create one race in the next round from the selected qualifiers. Lane
// order follows the order given (fastest-first gets the centre-out bias),
// a simple stand-in for real seeding.
router.post('/events/:id/create-next-round', (req, res) => {
  const database = db.load();
  const event = database.events[req.params.id];
  if (!event) return res.status(404).json({ error: 'Event not found' });
  const { phase, entryIds } = req.body;
  if (!event.plan || !event.plan.rounds || !event.plan.rounds.includes(phase)) {
    return res.status(400).json({ error: `"${phase}" isn't a planned round for this event.` });
  }
  const meetLanes = getMeetLanes(database, event.meetId);
  if (!Array.isArray(entryIds) || entryIds.length === 0) return res.status(400).json({ error: 'Select at least one qualifier.' });
  if (entryIds.length > meetLanes) return res.status(400).json({ error: `That's ${entryIds.length} boats — more than ${meetLanes} lanes at this venue.` });

  const samePhaseRaces = Object.values(database.races).filter((r) => r.eventId === event.id && r.phase === phase);
  const alreadyPlaced = new Set();
  samePhaseRaces.forEach((r) => Object.values(r.lanes).forEach((eid) => { if (eid) alreadyPlaced.add(eid); }));
  const dup = entryIds.find((id) => alreadyPlaced.has(id));
  if (dup) return res.status(400).json({ error: 'One of the selected boats is already placed in this round.' });

  const lanes = assignLanes(entryIds, meetLanes);
  const raceId = db.nextId();
  database.races[raceId] = {
    id: raceId, eventId: event.id, phase, heatNumber: samePhaseRaces.length + 1,
    raceNumber: nextRaceNumber(database, event.meetId), published: false,
    scheduledLabel: null, status: 'pending', startTimeMs: null, lanes,
  };
  db.save();
  res.json(enrichRace(database, database.races[raceId]));
});


// --- Mass-start events (2000m/5000m): bib numbers instead of lanes -----

// Assign sequential SLIDE NUMBERS (the number board on the boat) across a
// pool of entries, sorted by surname so the printed list and the physical
// order of boards line up predictably. Used both for a single event and
// for a combined group (pooled across every event in the group at once).
function assignSlideNumbers(database, entries, startSlide) {
  const sorted = entries
    .map((e) => ({ e, athlete: database.athletes[e.athleteIds[0]] || {} }))
    .sort((a, b) => (a.athlete.surname || '').localeCompare(b.athlete.surname || ''));
  sorted.forEach(({ e }, i) => { e.boatNumber = startSlide + i; });
  return sorted.length;
}

// Assign slide numbers to every active entry in this event, starting from
// `startSlide`. Call this separately per age group so you can leave a gap
// between blocks (e.g. U8-U12 starting at 20, everyone else starting at
// 70) — or, if you're combining events anyway, skip this and let the
// combine step assign slide numbers across the whole pooled group at once.
router.post('/events/:id/assign-bibs', (req, res) => {
  const database = db.load();
  const event = database.events[req.params.id];
  if (!event) return res.status(404).json({ error: 'Event not found' });
  if (!event.isMassStart) return res.status(400).json({ error: 'Slide numbers are only for mass-start (2000m/5000m) events.' });
  const startBib = Number(req.body.startBib);
  if (!Number.isInteger(startBib) || startBib < 1) return res.status(400).json({ error: 'Starting slide number must be a positive whole number.' });

  const entries = eventEntries(database, event.id);
  const count = assignSlideNumbers(database, entries, startBib);
  db.save();
  res.json({ assigned: count, range: count ? [startBib, startBib + count - 1] : null });
});

// Create the mass-start race itself, once bibs are assigned. One race per
// event — everyone starts together, no heats. `totalLaps` is set by the
// office (matches the physical course) and drives lap counting on the
// Tower.
router.post('/events/:id/generate-mass-race', (req, res) => {
  const database = db.load();
  const event = database.events[req.params.id];
  if (!event) return res.status(404).json({ error: 'Event not found' });
  if (!event.isMassStart) return res.status(400).json({ error: 'This isn\'t a mass-start event.' });
  const totalLaps = Number(req.body.totalLaps);
  if (!Number.isInteger(totalLaps) || totalLaps < 1) return res.status(400).json({ error: 'totalLaps must be a positive whole number.' });

  const entries = eventEntries(database, event.id);
  if (entries.length < 3) return res.status(400).json({ error: 'Fewer than 3 boats entered (ICF 5.1.1).' });
  const missingBib = entries.some((e) => !e.boatNumber);
  if (missingBib) {
    const startSlide = Number(req.body.startSlide);
    if (!Number.isInteger(startSlide) || startSlide < 1) return res.status(400).json({ error: 'Enter a starting slide number to assign.' });
    assignSlideNumbers(database, entries, startSlide);
  }

  const existing = Object.values(database.races).filter((r) => r.eventId === event.id);
  if (existing.length) return res.status(400).json({ error: 'A race is already generated for this event. Delete it first if you need to redo slides/laps.' });

  const lanes = {};
  entries.forEach((e) => { lanes[e.boatNumber] = e.id; });
  const raceId = db.nextId();
  database.races[raceId] = {
    id: raceId, eventId: event.id, phase: 'final', heatNumber: 1,
    raceNumber: nextRaceNumber(database, event.meetId), published: false,
    scheduledLabel: null, status: 'pending', startTimeMs: null, lanes,
    isMassStart: true, totalLaps,
  };
  database.lapPasses[raceId] = {};
  db.save();
  res.json(enrichRace(database, database.races[raceId]));
});

// --- Combined starts (e.g. "MIXED U10-U12") -----------------------------
// Several age-category events share ONE physical start (common at
// Provincial level per PSA). Results are still ranked and medalled
// per-event afterward (see results.js) — this only pools who's racing
// together.

router.post('/combine/generate-mass-race', (req, res) => {
  const database = db.load();
  const { eventIds, totalLaps, label, startSlide } = req.body;
  if (!Array.isArray(eventIds) || eventIds.length < 2) return res.status(400).json({ error: 'Give at least 2 events to combine.' });
  const events = eventIds.map((id) => database.events[id]);
  if (events.some((e) => !e)) return res.status(404).json({ error: 'One or more events not found.' });
  if (events.some((e) => !e.isMassStart)) return res.status(400).json({ error: 'All combined events must be mass-start (2000m/5000m).' });
  if (new Set(events.map((e) => e.meetId)).size > 1) return res.status(400).json({ error: 'Combined events must all be in the same meet.' });
  if (new Set(events.map((e) => e.distance)).size > 1) return res.status(400).json({ error: `Can't combine different distances (${[...new Set(events.map((e) => e.distance))].join(', ')}) — everyone in one race must cover the same distance.` });
  if (events.some((e) => Object.values(database.races).some((r) => raceMatchesEvent(r, e.id)))) {
    return res.status(400).json({ error: 'One of these events already has a race generated.' });
  }
  const laps = Number(totalLaps);
  if (!Number.isInteger(laps) || laps < 1) return res.status(400).json({ error: 'totalLaps must be a positive whole number.' });

  const allEntries = eventIds.flatMap((id) => eventEntries(database, id));
  if (allEntries.length === 0) return res.status(400).json({ error: 'No active entries across these events.' });
  // Below ICF 5.1.1's minimum is allowed here too (flagged, not refused)
  // — same reasoning as the lane combine: combining is often how an
  // undersized category gets raced at all.
  const belowMinimum = allEntries.length < 3;

  // Assign slide numbers pooled across the WHOLE combined group at once
  // (not per small age category) if they haven't been assigned already.
  const missingBib = allEntries.some((e) => !e.boatNumber);
  if (missingBib) {
    const start = Number(startSlide);
    if (!Number.isInteger(start) || start < 1) return res.status(400).json({ error: 'Enter a starting slide number for this combined group.' });
    assignSlideNumbers(database, allEntries, start);
  }
  const bibs = allEntries.map((e) => e.boatNumber);
  if (new Set(bibs).size !== bibs.length) return res.status(400).json({ error: 'Slide numbers collide across these events — a manual assignment conflicts with another block.' });

  const lanes = {};
  allEntries.forEach((e) => { lanes[e.boatNumber] = e.id; });
  const raceId = db.nextId();
  database.races[raceId] = {
    id: raceId, eventId: eventIds[0], combinedEventIds: eventIds, phase: 'final', heatNumber: 1,
    raceNumber: nextRaceNumber(database, events[0].meetId), published: false,
    scheduledLabel: null, status: 'pending', startTimeMs: null, lanes,
    isMassStart: true, totalLaps: laps, combinedLabel: label || autoCombinedLabel(events),
    ...(belowMinimum ? { overridden: true } : {}),
  };
  database.lapPasses[raceId] = {};
  db.save();
  res.json(enrichRace(database, database.races[raceId]));
});

// Combined straight final for small lane-based categories (e.g. two
// under-5-boat age groups sharing one final). Scoped to straight-final
// only — combining fields big enough to need heats isn't supported yet.
router.post('/combine/generate-final', (req, res) => {
  const database = db.load();
  const { eventIds, label } = req.body;
  if (!Array.isArray(eventIds) || eventIds.length < 2) return res.status(400).json({ error: 'Give at least 2 events to combine.' });
  const events = eventIds.map((id) => database.events[id]);
  if (events.some((e) => !e)) return res.status(404).json({ error: 'One or more events not found.' });
  if (events.some((e) => e.isMassStart)) return res.status(400).json({ error: 'Mass-start events use "combine mass race" instead.' });
  if (new Set(events.map((e) => e.meetId)).size > 1) return res.status(400).json({ error: 'Combined events must all be in the same meet.' });
  if (new Set(events.map((e) => e.distance)).size > 1) return res.status(400).json({ error: `Can't combine different distances (${[...new Set(events.map((e) => e.distance))].join(', ')}) — everyone in one race must cover the same distance.` });
  if (events.some((e) => Object.values(database.races).some((r) => raceMatchesEvent(r, e.id)))) {
    return res.status(400).json({ error: 'One of these events already has a race generated.' });
  }

  const meetLanes = getMeetLanes(database, events[0].meetId);
  const allEntries = eventIds.flatMap((id) => eventEntries(database, id)).map((e) => e.id);
  if (allEntries.length === 0) return res.status(400).json({ error: 'No active entries across these events.' });

  // Below ICF 5.1.1's 3-boat minimum? Combining is often exactly HOW an
  // undersized category gets raced at all, so refusing here defeated the
  // purpose of the tool. Draw it as a straight final and flag it as
  // overridden (same treatment as "Race anyway" on a single event) so
  // it's visibly known rather than silently sub-minimum.
  const belowMinimum = allEntries.length < 3;
  const format = belowMinimum
    ? { runnable: true, rounds: ['final'], heatsNeeded: 1, numSemis: 0, finalsNeeded: 1, note: `Combined to ${allEntries.length} boat(s) — below ICF 5.1.1 minimum of 3, manually overridden.` }
    : rules.decideFormat(allEntries.length, meetLanes);
  if (!format.runnable) return res.status(400).json({ error: format.reason });

  const primaryEvent = events[0];
  primaryEvent.plan = format;
  primaryEvent.pendingDirectQualifiers = [];
  const combinedLabel = label || autoCombinedLabel(events);

  const createdRaces = createRacesForFormat(database, {
    entries: allEntries, format, eventId: eventIds[0], meetId: primaryEvent.meetId, meetLanes,
    extra: { combinedEventIds: eventIds, combinedLabel, ...(belowMinimum ? { overridden: true } : {}) },
  });

  db.save();
  res.json({ ...enrichRace(database, database.races[createdRaces[0]]), createdRaces: createdRaces.length, format });
});


// Heuristic day-planning. TWO rules, in priority order:
//  1. One distance finishes completely (every heat, semi, final — as far
//     as they're drawn so far) before the next distance starts. This is a
//     physical constraint (start/finish setup, marshaling) — you don't
//     interleave 1000m and 500m racing.
//  2. WITHIN a distance: heats belonging to multi-round events (they gate
//     a semi/final later) go first, with straight finals interspersed so
//     results start coming in rather than one long block of heats.
// This only reorders races that haven't started — semis/finals for a
// heat that hasn't run yet don't exist as real races until it finishes
// (they're reserved as placeholders, see programme.js generate()), so
// this is a first-pass plan for what's drawn so far, not a full day
// timetable computed in one shot. Re-run "Generate start times" (with
// overwrite) after this to get times matching the new order.
router.post('/auto-sequence', (req, res) => {
  const database = db.load();
  const { meetId } = req.body;
  if (!database.meets[meetId]) return res.status(400).json({ error: 'Meet not found.' });
  const eventIds = new Set(Object.values(database.events).filter((e) => e.meetId === meetId).map((e) => e.id));
  const pending = Object.values(database.races).filter((r) => eventIds.has(r.eventId) && r.status === 'pending');
  const locked = Object.values(database.races).filter((r) => eventIds.has(r.eventId) && r.status !== 'pending');
  const maxLockedNumber = locked.reduce((m, r) => Math.max(m, r.raceNumber), 0);

  // Age order: youngest to oldest covering all PSA/ICF categories
  const AGE_ORDER = [
    'GUPPY','U8','U9','U10','U11','U12','U13','U14','U15','U16','U17','U18',
    'U19','U20','U21','U23','U26','JUN','JUNIOR',
    'SNR','SENIOR','OPEN','ELITE',
    '35-45','35-55','35-65','35+','35',
    '45-55','45-60','45-65','45+','45',
    '55-65','55+','55',
    '60+','60','65+','65','70+','70','75+','80+',
  ];

  function ageRank(ageCategory) {
    if (!ageCategory) return 999;
    const upper = ageCategory.toUpperCase().trim();
    const idx = AGE_ORDER.findIndex((a) => upper.includes(a) || a === upper);
    return idx === -1 ? 500 : idx;
  }

  // Phase order: heats first, then semis, then finals
  const PHASE_ORDER = { heat: 0, semi: 1, final: 2, finalB: 3, finalC: 4 };
  function phaseRank(phase) { return PHASE_ORDER[phase] !== undefined ? PHASE_ORDER[phase] : 2; }

  function distRank(eventId) {
    const ev = database.events[eventId];
    return ev ? (parseInt(ev.distance, 10) || 0) : 0;
  }

  function eventAge(eventId) {
    const ev = database.events[eventId];
    return ev ? ageRank(ev.ageCategory) : 999;
  }

  // Sort: phase → distance → age → heat number
  // Distance grouped so cam docks/jetties don't have to move mid-phase
  const sorted = [...pending].sort((a, b) => {
    const pDiff = phaseRank(a.phase) - phaseRank(b.phase);
    if (pDiff !== 0) return pDiff;
    const dDiff = distRank(a.eventId) - distRank(b.eventId);
    if (dDiff !== 0) return dDiff;
    const ageDiff = eventAge(a.eventId) - eventAge(b.eventId);
    if (ageDiff !== 0) return ageDiff;
    return (a.heatNumber || 0) - (b.heatNumber || 0);
  });

  sorted.forEach((r, i) => { r.raceNumber = maxLockedNumber + i + 1; });
  reflowTimes(database, meetId);
  db.save();
  res.json({ reordered: sorted.length });
});

// Manual reorder: office repositions races (up/down in the UI) and this
// commits the new order as raceNumbers. Only touches races not yet
// started; anything running/finished keeps its position in history.
router.post('/reorder-races', (req, res) => {
  const database = db.load();
  const { meetId, orderedRaceIds } = req.body;
  if (!database.meets[meetId]) return res.status(400).json({ error: 'Meet not found.' });
  if (!Array.isArray(orderedRaceIds) || orderedRaceIds.length === 0) return res.status(400).json({ error: 'orderedRaceIds is required.' });

  const races = orderedRaceIds.map((id) => database.races[id]);
  if (races.some((r) => !r)) return res.status(404).json({ error: 'One or more races not found.' });
  if (races.some((r) => r.status !== 'pending')) return res.status(400).json({ error: 'Can only reorder races that have not started.' });

  // Reuse the EXACT set of race numbers these races already hold — just
  // permuted into the new order — rather than computing fresh numbers
  // from "how many locked races exist." The old approach broke when the
  // caller only sends a PARTIAL race list (e.g. one day's races, when a
  // day filter is active on Race Program): the fresh numbers it invented
  // could collide with numbers already held by a different day's
  // still-pending races, since those weren't part of this reorder and
  // never got checked against. Reusing the existing set guarantees no
  // collision is possible, because these exact numbers were already
  // exclusively "owned" by this exact set of races.
  const reservedNumbers = races.map((r) => r.raceNumber).sort((a, b) => a - b);
  races.forEach((r, i) => { r.raceNumber = reservedNumbers[i]; });

  reflowTimes(database, meetId);
  db.save();
  res.json({ reordered: races.length });
});

function formatHHMM(totalMinutes) {
  const total = ((Math.round(totalMinutes) % (24 * 60)) + 24 * 60) % (24 * 60);
  const hh = String(Math.floor(total / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

function parseHHMM(label) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(label || '');
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

// Every pending race AND every break for this meet, in one combined
// display/timing order — races sorted by their own raceNumber (an
// integer, e.g. 1, 2, 3), breaks by their sortKey (a float that sits
// between two race numbers, e.g. 2.5 between race 2 and 3). Used
// wherever the two need to be walked together (reflow, the schedule
// endpoint) — kept out of anything Tower/board/weigh/results touch,
// since those only ever ask for races directly (see routes/races.js and
// the plain /races endpoint below, both untouched by breaks).
function combinedSchedule(database, meetId, dayFilter) {
  const eventIds = new Set(Object.values(database.events).filter((e) => e.meetId === meetId).map((e) => e.id));
  const races = Object.values(database.races)
    .filter((r) => {
      if (!eventIds.has(r.eventId)) return false;
      if (r.status !== 'pending') return false;
      if (!dayFilter) return true;
      // race.day takes priority; fall back to event.day, then default day 1
      const raceDay = r.day || (database.events[r.eventId] && database.events[r.eventId].day) || 1;
      return raceDay === dayFilter;
    })
    .map((r) => ({ type: 'race', sortKey: r.raceNumber, ref: r }));
  const breaks = Object.values(database.breaks)
    .filter((b) => b.meetId === meetId && (!dayFilter || (b.day || 1) === dayFilter))
    .map((b) => ({ type: 'break', sortKey: b.sortKey, ref: b }));
  return [...races, ...breaks].sort((a, b) => a.sortKey - b.sortKey);
}

// Auto-fill start times across every not-yet-published race (and every
// break) in combined order, starting from firstTime ("HH:MM"). Each item
// is spaced from the one before it by that previous item's own gap: for
// a race, its own override if it has one (see gapAfter below) or
// otherwise the meet's standard interval; for a break, its duration —
// that IS the point of a break, to reserve a specific block of time
// (jetty move, lunch, tea...) regardless of the standard gap.
// Recomputes every pending race's AND every break's scheduledLabel in
// combined order, using whatever start time/interval was last used for
// this meet (see generate-start-times below, which sets these). No-op if
// times have never been generated yet for this meet. Called
// automatically after a reorder, auto-sequence, or any gap/break change,
// so race 1 always stays anchored at its original time and everything
// downstream shifts to match — no separate manual "re-run start times"
// step needed.
function gapAfter(meet, race) {
  return (race.gapAfterMinutes != null && race.gapAfterMinutes > 0) ? race.gapAfterMinutes : meet.lastIntervalMinutes;
}

function reflowTimes(database, meetId) {
  const meet = database.meets[meetId];
  if (!meet || meet.lastStartTime == null || meet.lastIntervalMinutes == null) return 0;
  const items = combinedSchedule(database, meetId);
  let current = meet.lastStartTime;
  items.forEach((item) => {
    item.ref.scheduledLabel = formatHHMM(current);
    current += item.type === 'race' ? gapAfter(meet, item.ref) : (item.ref.durationMinutes || meet.lastIntervalMinutes);
  });
  return items.length;
}

router.post('/generate-start-times', (req, res) => {
  const database = db.load();
  const { meetId, firstTime, intervalMinutes, overwrite, day } = req.body;
  if (!database.meets[meetId]) return res.status(400).json({ error: 'Meet not found.' });
  const m = /^(\d{1,2}):(\d{2})$/.exec(firstTime || '');
  if (!m) return res.status(400).json({ error: 'firstTime must look like "08:00".' });
  const startMinutes = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  const interval = Number(intervalMinutes);
  if (!interval || interval <= 0) return res.status(400).json({ error: 'intervalMinutes must be a positive number.' });

  database.meets[meetId].lastStartTime = startMinutes;
  database.meets[meetId].lastIntervalMinutes = interval;
  const meet = database.meets[meetId];

  // If a specific day is requested, only reflow that day's races
  const dayFilter = day ? Number(day) : null;
  const items = combinedSchedule(database, meetId, dayFilter);

  let current = startMinutes;
  let updated = 0;
  items.forEach((item) => {
    if (item.ref.scheduledLabel && !overwrite) {
      const existing = parseHHMM(item.ref.scheduledLabel);
      if (existing != null) current = existing;
    } else {
      item.ref.scheduledLabel = formatHHMM(current);
      updated++;
    }
    current += item.type === 'race' ? gapAfter(meet, item.ref) : (item.ref.durationMinutes || interval);
  });

  db.save();
  res.json({ updated });
});

// Set (or clear) how much room a specific race needs before the next one
// can start — e.g. 45-60 min for a long 2000m/5000m mass start, instead
// of the meet's standard gap. Stored on the race itself, so it keeps
// applying wherever this race ends up after a reorder, rather than being
// tied to a fixed position in the running order. Reflows every
// downstream time immediately so the effect is visible right away.
router.post('/races/:raceId/gap', (req, res) => {
  const database = db.load();
  const race = database.races[req.params.raceId];
  if (!race) return res.status(404).json({ error: 'Race not found.' });
  const event = database.events[race.eventId];
  if (!event) return res.status(400).json({ error: 'Event not found for this race.' });

  const { gapAfterMinutes } = req.body;
  if (gapAfterMinutes === null || gapAfterMinutes === '' || gapAfterMinutes === undefined) {
    delete race.gapAfterMinutes;
  } else {
    const g = Number(gapAfterMinutes);
    if (!Number.isFinite(g) || g <= 0) return res.status(400).json({ error: 'Gap must be a positive number of minutes, or blank to use the standard gap.' });
    race.gapAfterMinutes = g;
  }

  reflowTimes(database, event.meetId);
  db.save();
  res.json({ race, gapAfterMinutes: race.gapAfterMinutes || null });
});

// The combined race+break running order, for Race Program's own planning
// view only — every OTHER page (Tower, board, weigh, results, exports)
// keeps using the plain /races endpoint above, which never includes
// breaks, so a break can never accidentally show up anywhere it would
// confuse a timekeeper or caller.
router.get('/schedule', (req, res) => {
  const database = db.load();
  const meetId = req.query.meetId;
  if (!meetId) return res.status(400).json({ error: 'meetId is required — pick a meet first.' });
  const dayFilter = req.query.day ? Number(req.query.day) : null;
  const items = combinedSchedule(database, meetId, dayFilter).map((item) => {
    if (item.type === 'race') return { ...enrichRace(database, item.ref), event: database.events[item.ref.eventId], type: 'race' };
    return { ...item.ref, type: 'break' };
  });
  res.json(items);
});

// Where a new break gets inserted: right after whichever item (race or
// break) currently sits at position `afterIndex` in the combined order
// (0 = before everything). Picks a sortKey strictly between that item and
// the next one — the classic "fractional indexing" trick — so nothing
// else needs to move or renumber.
function sortKeyAfter(items, afterIndex) {
  const before = items[afterIndex] ? items[afterIndex].sortKey : -Infinity;
  const after = items[afterIndex + 1] ? items[afterIndex + 1].sortKey : (items[afterIndex] ? items[afterIndex].sortKey + 1 : 1);
  return before === -Infinity ? after - 1 : (before + after) / 2;
}

// Add a non-race schedule marker — jetty move, lunch, tea, anything that
// needs its own block of time but isn't a race. Inserted right after
// position `afterIndex` in the CURRENT combined running order (0 = start
// of the day); use the ▲▼/# controls afterward to fine-tune, same as a
// race. Reflows immediately so its effect on everything after it is
// visible right away.
router.post('/breaks', (req, res) => {
  const database = db.load();
  const { meetId, day, label, durationMinutes, afterRaceId } = req.body;
  if (!database.meets[meetId]) return res.status(400).json({ error: 'Meet not found.' });
  const dur = Number(durationMinutes);
  if (!dur || dur <= 0) return res.status(400).json({ error: 'durationMinutes must be a positive number.' });

  const dayNum = day ? Number(day) : 1;

  let sortKey;
  if (afterRaceId && afterRaceId !== '') {
    // Try direct ID lookup first
    const afterRace = database.races[String(afterRaceId)];
    if (afterRace) {
      const eventIds = new Set(Object.values(database.events).filter((e) => e.meetId === meetId).map((e) => e.id));
      const nextRace = Object.values(database.races)
        .filter((r) => eventIds.has(r.eventId) && r.status === 'pending' && r.raceNumber > afterRace.raceNumber)
        .sort((a, b) => a.raceNumber - b.raceNumber)[0];
      sortKey = nextRace
        ? (afterRace.raceNumber + nextRace.raceNumber) / 2
        : afterRace.raceNumber + 0.5;
    } else {
      // Fallback: treat afterRaceId as a raceNumber
      const eventIds = new Set(Object.values(database.events).filter((e) => e.meetId === meetId).map((e) => e.id));
      const allRaces = Object.values(database.races)
        .filter((r) => eventIds.has(r.eventId) && r.status === 'pending')
        .sort((a, b) => a.raceNumber - b.raceNumber);
      const num = Number(afterRaceId);
      const afterRaceByNum = allRaces.find((r) => r.raceNumber === num);
      if (afterRaceByNum) {
        const nextRace = allRaces.find((r) => r.raceNumber > afterRaceByNum.raceNumber);
        sortKey = nextRace
          ? (afterRaceByNum.raceNumber + nextRace.raceNumber) / 2
          : afterRaceByNum.raceNumber + 0.5;
      } else {
        // Last resort: append after all races
        const last = allRaces[allRaces.length - 1];
        sortKey = last ? last.raceNumber + 0.5 : 0.5;
      }
    }
  } else {
    // No race specified — put before everything
    const eventIds = new Set(Object.values(database.events).filter((e) => e.meetId === meetId).map((e) => e.id));
    const firstRace = Object.values(database.races)
      .filter((r) => eventIds.has(r.eventId) && r.status === 'pending')
      .sort((a, b) => a.raceNumber - b.raceNumber)[0];
    sortKey = firstRace ? firstRace.raceNumber - 0.5 : 0.5;
  }

  const id = db.nextId();
  database.breaks[id] = { id, meetId, day: dayNum, label: (label || 'Break').trim() || 'Break', durationMinutes: dur, sortKey, scheduledLabel: null };
  reflowTimes(database, meetId);
  db.save();
  res.json(database.breaks[id]);
});

router.patch('/breaks/:id', (req, res) => {
  const database = db.load();
  const brk = database.breaks[req.params.id];
  if (!brk) return res.status(404).json({ error: 'Break not found.' });
  if (req.body.label !== undefined) brk.label = (String(req.body.label).trim() || 'Break');
  if (req.body.durationMinutes !== undefined) {
    const dur = Number(req.body.durationMinutes);
    if (!dur || dur <= 0) return res.status(400).json({ error: 'durationMinutes must be a positive number.' });
    brk.durationMinutes = dur;
  }
  reflowTimes(database, brk.meetId);
  db.save();
  res.json(brk);
});

// Move a break within the combined race+break order — same ▲/▼/jump-to-
// position semantics as moveRaceTo for races, just working across both
// types at once. Only the break's own sortKey ever changes; races keep
// their integer raceNumbers untouched no matter how many breaks move
// around them.
router.post('/breaks/:id/move', (req, res) => {
  const database = db.load();
  const brk = database.breaks[req.params.id];
  if (!brk) return res.status(404).json({ error: 'Break not found.' });
  const { target } = req.body;

  const items = combinedSchedule(database, brk.meetId);
  const idx = items.findIndex((it) => it.type === 'break' && it.ref.id === brk.id);
  if (idx === -1) return res.status(400).json({ error: 'Break not found in schedule.' });
  const withoutSelf = items.filter((_, i) => i !== idx);

  let insertAfter;
  if (target === 'top') insertAfter = -1;
  else if (target === 'bottom') insertAfter = withoutSelf.length - 1;
  else if (target === 'up') insertAfter = Math.max(-1, idx - 2);
  else if (target === 'down') insertAfter = Math.min(withoutSelf.length - 1, idx);
  else {
    const posIdx = Math.max(1, Math.min(withoutSelf.length + 1, Number(target))) - 1;
    if (isNaN(posIdx)) return res.status(400).json({ error: 'Enter a position number.' });
    insertAfter = posIdx - 1;
  }

  brk.sortKey = sortKeyAfter(withoutSelf, insertAfter);
  reflowTimes(database, brk.meetId);
  db.save();
  res.json(brk);
});

router.delete('/breaks/:id', (req, res) => {
  const database = db.load();
  const brk = database.breaks[req.params.id];
  if (!brk) return res.status(404).json({ error: 'Break not found.' });
  const meetId = brk.meetId;
  delete database.breaks[req.params.id];
  reflowTimes(database, meetId);
  db.save();
  res.json({ deleted: true });
});

// Publish every drawn-but-unpublished race for a meet — this is the
// "Finalise" action. Only after this do races show up on the Tower.
// Safe to click repeatedly: already-published races are just skipped, so
// a second click reporting "0 newly published" is normal, not a bug —
// it means everything drawn so far is already on the Tower.
router.post('/finalise', (req, res) => {
  const database = db.load();
  const { meetId } = req.body;
  if (!database.meets[meetId]) return res.status(400).json({ error: 'Meet not found.' });
  const eventIds = new Set(Object.values(database.events).filter((e) => e.meetId === meetId).map((e) => e.id));
  const allMeetRaces = Object.values(database.races).filter((r) => eventIds.has(r.eventId));
  let newlyPublished = 0;
  allMeetRaces.forEach((r) => {
    if (r.status !== 'finished' && !r.published) { r.published = true; newlyPublished++; }
  });
  db.save();
  const alreadyPublished = allMeetRaces.filter((r) => r.published).length - newlyPublished;
  res.json({ published: newlyPublished, alreadyPublished, totalDrawn: allMeetRaces.length });
});

module.exports = router;
