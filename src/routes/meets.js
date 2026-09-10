const express = require('express');
const db = require('../db');
const rules = require('../rules');

const router = express.Router();

router.get('/', (req, res) => {
  const database = db.load();
  const meets = Object.values(database.meets).sort((a, b) => b.createdAt - a.createdAt);
  res.json(meets);
});

router.post('/', (req, res) => {
  const database = db.load();
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Meet name is required, e.g. "PSA Sprint 2026".' });
  let lanes = req.body.lanes === undefined || req.body.lanes === '' ? rules.DEFAULT_LANES : Number(req.body.lanes);
  if (!Number.isInteger(lanes) || lanes < 2 || lanes > 20) {
    return res.status(400).json({ error: 'Lane count must be a whole number between 2 and 20.' });
  }
  let restMinutes = req.body.restMinutes === undefined || req.body.restMinutes === '' ? 20 : Number(req.body.restMinutes);
  if (!Number.isInteger(restMinutes) || restMinutes < 0 || restMinutes > 240) {
    return res.status(400).json({ error: 'Rest minutes must be a whole number between 0 and 240.' });
  }
  let numDays = req.body.numDays === undefined || req.body.numDays === '' ? 1 : Number(req.body.numDays);
  if (!Number.isInteger(numDays) || numDays < 1 || numDays > 14) {
    return res.status(400).json({ error: 'Number of days must be a whole number between 1 and 14.' });
  }
  // The rules engine (rules.js, progression.js) only knows ICF sprint
  // format today. Trilogy/Marathon/River are on the roadmap — accepted
  // here so the meet list can already show what's coming, but locked to
  // 'sprint' for now since picking one of the others would create a meet
  // this app can't actually run yet (no format/scoring rules for it).
  const raceType = req.body.raceType || 'sprint';
  if (raceType !== 'sprint') {
    return res.status(400).json({ error: `${raceType} isn't supported yet — this app only runs Sprints for now.` });
  }
  const id = db.nextId();
  database.meets[id] = { id, name, raceType, lanes, restMinutes, numDays, createdAt: Date.now(), nextRaceNumber: 1 };
  db.save();
  res.json(database.meets[id]);
});

// Change a meet's lane count. Only safe before any races are drawn —
// changing it after would leave existing draws inconsistent with the new
// course size, so we refuse rather than silently corrupt a draw in
// progress.
router.patch('/:id/lanes', (req, res) => {
  const database = db.load();
  const meet = database.meets[req.params.id];
  if (!meet) return res.status(404).json({ error: 'Meet not found.' });
  const lanes = Number(req.body.lanes);
  if (!Number.isInteger(lanes) || lanes < 2 || lanes > 20) {
    return res.status(400).json({ error: 'Lane count must be a whole number between 2 and 20.' });
  }
  const eventIds = new Set(Object.values(database.events).filter((e) => e.meetId === meet.id).map((e) => e.id));
  const hasRaces = Object.values(database.races).some((r) => eventIds.has(r.eventId));
  if (hasRaces) return res.status(400).json({ error: 'This meet already has races drawn — changing lane count now would leave them inconsistent. Create a new meet instead, or delete all races first.' });
  meet.lanes = lanes;
  db.save();
  res.json(meet);
});

// Delete a meet and ALL its data — athletes, events, entries, races,
// results, weigh-ins. Irreversible. Confirmed on the client before calling.
router.delete('/:id', (req, res) => {
  const database = db.load();
  const meet = database.meets[req.params.id];
  if (!meet) return res.status(404).json({ error: 'Meet not found.' });

  // Find all eventIds belonging to this meet
  const eventIds = new Set(
    Object.values(database.events).filter((e) => e.meetId === meet.id).map((e) => e.id)
  );
  // Find all entryIds belonging to those events
  const entryIds = new Set(
    Object.values(database.entries).filter((e) => eventIds.has(e.eventId)).map((e) => e.id)
  );
  // Find all raceIds belonging to those events
  const raceIds = new Set(
    Object.values(database.races).filter((r) => eventIds.has(r.eventId)).map((r) => r.id)
  );

  // Delete everything
  raceIds.forEach((id) => { delete database.raceResults[id]; delete database.blindCrossings[id]; delete database.lapPasses[id]; });
  raceIds.forEach((id) => delete database.races[id]);
  entryIds.forEach((id) => { delete database.entries[id]; delete database.weighIns[id]; });
  eventIds.forEach((id) => delete database.events[id]);
  delete database.meets[meet.id];

  db.save();
  res.json({ deleted: meet.name });
});

router.patch('/:id/num-days', (req, res) => {
  const database = db.load();
  const meet = database.meets[req.params.id];
  if (!meet) return res.status(404).json({ error: 'Meet not found.' });
  const numDays = Number(req.body.numDays);
  if (!Number.isInteger(numDays) || numDays < 1 || numDays > 14) {
    return res.status(400).json({ error: 'Number of days must be between 1 and 14.' });
  }
  meet.numDays = numDays;
  db.save();
  res.json(meet);
});

// Setup progress for the progress strip on setup pages.
router.get('/:id/setup-status', (req, res) => {
  const database = db.load();
  const meet = database.meets[req.params.id];
  if (!meet) return res.status(404).json({ error: 'Meet not found.' });
  const events = Object.values(database.events).filter((e) => e.meetId === meet.id);
  const eventIds = new Set(events.map((e) => e.id));
  const entries = Object.values(database.entries).filter((en) => eventIds.has(en.eventId));
  const races = Object.values(database.races).filter((r) => eventIds.has(r.eventId));
  const drawable = events.filter((e) => entries.some((en) => en.eventId === e.id));
  const drawnConfirmed = drawable.length > 0 && drawable.every((e) => e.drawConfirmed || races.some((r) => r.eventId === e.id && r.combinedEventIds));
  const anyScheduled = races.some((r) => r.scheduledLabel);
  const anyPublished = races.some((r) => r.published);
  const daysMissing = (meet.numDays || 1) > 1 && races.some((r) => !r.day);
  res.json({
    imported: entries.length > 0,
    sorted: races.some((r) => r.combinedEventIds && r.combinedEventIds.length > 1) || !!meet.raceSortChecked,
    drawn: drawnConfirmed,
    programmed: anyScheduled,
    finalised: anyPublished,
    daysMissing,
    numDays: meet.numDays || 1,
  });
});

// Race Sort has no mandatory action — the office confirms it's been
// reviewed (either combining groups, or explicitly saying nothing needs it).
router.post('/:id/race-sort-checked', (req, res) => {
  const database = db.load();
  const meet = database.meets[req.params.id];
  if (!meet) return res.status(404).json({ error: 'Meet not found.' });
  meet.raceSortChecked = true;
  db.save();
  res.json({ ok: true });
});

module.exports = router;
