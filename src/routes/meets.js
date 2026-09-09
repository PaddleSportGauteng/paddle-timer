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
  // The rules engine (rules.js, progression.js) only knows ICF/PSA sprint
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

module.exports = router;
