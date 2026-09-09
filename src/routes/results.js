const express = require('express');
const db = require('../db');
const rules = require('../rules');
const { sortByScheduleThenNumber, enrichRace } = require('../present');

const router = express.Router();

function namesFor(database, entryId) {
  const entry = database.entries[entryId];
  if (!entry) return { names: ['?'], club: null };
  const names = entry.athleteIds.map((aid) => {
    const a = database.athletes[aid];
    return a ? `${a.firstName} ${a.surname || ''}`.trim() : '?';
  });
  const first = database.athletes[entry.athleteIds[0]];
  return { names, club: first ? first.club : null };
}

function buildRanked(database, results, filterEntryId) {
  return Object.entries(results)
    .filter(([entryId, r]) => r.status === 'OK' && (!filterEntryId || filterEntryId(entryId)))
    .sort((a, b) => a[1].finishTimeMs - b[1].finishTimeMs)
    .map(([entryId, r], i) => {
      const { names, club } = namesFor(database, entryId);
      const weighIn = database.weighIns[entryId] || null;
      return { place: i + 1, entryId, names, club, timeMs: r.finishTimeMs, weighIn };
    });
}

function buildOthers(database, results, filterEntryId) {
  return Object.entries(results)
    .filter(([entryId, r]) => r.status !== 'OK' && (!filterEntryId || filterEntryId(entryId)))
    .map(([entryId, r]) => {
      const { names } = namesFor(database, entryId);
      const weighIn = database.weighIns[entryId] || null;
      return { entryId, names, status: r.status, dqReason: r.dqReason, weighIn };
    });
}

// Every finished race for a meet, as separate result "blocks" ready to
// display like the Weigh Station's race cards — no need to pick one event
// from a dropdown. Heats/semis show times/positions for reference; only
// FINAL-phase races carry medal badges (isFinal: true).
//
// Combined starts split differently depending on WHY they were combined:
//  - Lane races combined to make up numbers (e.g. U14+U16 sharing a heat
//    to use the lanes efficiently) split back into separate result blocks
//    per original age-group event — they're still different categories
//    and can't be medalled against each other (PSA 1.2.1/1.2.2).
//  - Mass-start races (2000m/5000m) are combined by DESIGN as one big
//    group (e.g. "2000m U8-U12 Male") and stay that way — one result
//    block for the whole race, not split back into individual ages.
router.get('/all', (req, res) => {
  const database = db.load();
  const meetId = req.query.meetId;
  if (!meetId) return res.status(400).json({ error: 'meetId is required — pick a meet first.' });
  const dayFilter = req.query.day ? Number(req.query.day) : null;
  const eventIds = new Set(
    Object.values(database.events)
      .filter((e) => e.meetId === meetId && (!dayFilter || (e.day || 1) === dayFilter))
      .map((e) => e.id)
  );

  const finishedRaces = sortByScheduleThenNumber(
    Object.values(database.races).filter((r) => eventIds.has(r.eventId) && r.status === 'finished')
  );

  const blocks = [];
  finishedRaces.forEach((race) => {
    const results = database.raceResults[race.id] || {};
    const isFinal = race.phase === 'final' || race.phase === 'finalB' || race.phase === 'finalC';
    const phaseLabel = { heat: `Heat ${race.heatNumber}`, semi: `Semi ${race.heatNumber}`, final: 'Final A', finalB: 'Final B', finalC: 'Final C' }[race.phase] || race.phase;
    const isCombined = race.combinedEventIds && race.combinedEventIds.length > 1;
    // Weigh-in status is a property of the whole physical race (who
    // actually crossed the line first), not of a split-out category —
    // same value on every block that comes from this one race.
    const weighInStatus = enrichRace(database, race).weighInStatus;

    if (race.isMassStart || !isCombined) {
      const label = race.combinedLabel || (database.events[race.eventId] && database.events[race.eventId].label) || '';
      const ranked = buildRanked(database, results);
      const others = buildOthers(database, results);
      const hasBoats = Object.values(race.lanes).some(Boolean);
      blocks.push({
        raceId: race.id, raceNumber: race.raceNumber, phase: race.phase, phaseLabel, isFinal,
        label, ranked, others, resultsConfirmed: !!race.resultsConfirmed, weighInStatus,
        noResultsRecorded: hasBoats && ranked.length === 0 && others.length === 0,
        medalEligibility: isFinal ? rules.computeMedalEligibility(ranked.length) : null,
      });
    } else {
      race.combinedEventIds.forEach((memberEventId) => {
        const memberEvent = database.events[memberEventId];
        if (!memberEvent) return;
        const filter = (entryId) => { const e = database.entries[entryId]; return e && e.eventId === memberEventId; };
        const ranked = buildRanked(database, results, filter);
        const others = buildOthers(database, results, filter);
        const hasSeatedBoats = Object.values(race.lanes).some((entryId) => entryId && filter(entryId));
        if (!hasSeatedBoats) return; // nobody from this category was ever in this race
        blocks.push({
          raceId: race.id, raceNumber: race.raceNumber, phase: race.phase, phaseLabel, isFinal, weighInStatus,
          label: memberEvent.label, combinedWith: race.combinedLabel, ranked, others, resultsConfirmed: !!race.resultsConfirmed,
          noResultsRecorded: ranked.length === 0 && others.length === 0,
          medalEligibility: isFinal ? rules.computeMedalEligibility(ranked.length) : null,
        });
      });
    }
  });

  res.json(blocks);
});

module.exports = router;
