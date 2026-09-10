// Attaches human-readable names/clubs to a race's lane assignments.
// Used by both races.js (tower) and programme.js (draw view / editing)
// so the two pages can never drift into showing different data shapes.
const rules = require('./rules');

// Auto-generate a 3-letter club code (DAB, SOW, ACD...) the first time a
// club is seen, and remember it — real federation codes are often
// negotiated/official rather than a pure algorithm (e.g. "Academy for
// Canoe Development" -> "ACD" isn't just the first 3 letters), so this is
// a reasonable starting guess, not a guarantee of matching an existing
// official list. Edit it in Race Office if it needs correcting; edits
// stick since this only generates when a name has no code yet.
function autoClubCode(clubName) {
  if (!clubName) return '???';
  let name = clubName.replace(/\bcanoe\s*club\b/i, '').replace(/\bclub\b/i, '').trim();
  if (!name) name = clubName;
  const letters = name.replace(/[^a-zA-Z]/g, '').toUpperCase();
  return (letters.slice(0, 3) || '???').padEnd(3, 'X');
}

function getClubCode(database, clubName) {
  if (!clubName) return '';
  if (database.clubCodes[clubName]) return database.clubCodes[clubName];
  const base = autoClubCode(clubName);
  const used = new Set(Object.values(database.clubCodes));
  let code = base;
  let i = 1;
  while (used.has(code)) { code = base.slice(0, 2) + i; i++; }
  database.clubCodes[clubName] = code;
  return code;
}

function enrichRace(database, race) {
  const laneEntries = {};
  Object.entries(race.lanes).forEach(([lane, entryId]) => {
    if (!entryId) { laneEntries[lane] = null; return; }
    const entry = database.entries[entryId];
    if (!entry) { laneEntries[lane] = null; return; }
    const names = entry.athleteIds.map((aid) => {
      const a = database.athletes[aid];
      return a ? `${a.firstName} ${a.surname || ''}`.trim() : '?';
    });
    const club = entry.athleteIds[0] ? (database.athletes[entry.athleteIds[0]] || {}).club : null;
    const clubCode = getClubCode(database, club);
    const union = club ? (database.clubUnions[club] || '') : '';
    const event = database.events[entry.eventId];
    const ageCategory = event ? (event.ageCategory || '') : '';
    const gender = event ? (event.gender || '') : '';
    const psaIds = entry.athleteIds.map(aid => (database.athletes[aid] || {}).psaId || '').filter(Boolean);
    const laps = race.isMassStart ? ((database.lapPasses[race.id] || {})[entryId] || []) : undefined;
    const weighIn = database.weighIns[entryId] || null;
    const raceWeighIn = (database.raceWeighIns && database.raceWeighIns[`${race.id}:${entryId}`]) || null;
    laneEntries[lane] = { entryId, names, club, clubCode, union, ageCategory, gender, psaIds, scratched: entry.status === 'scratched', laps, weighIn, raceWeighIn };
  });
  const results = database.raceResults[race.id] || {};
  const blindCrossings = database.blindCrossings ? (database.blindCrossings[race.id] || []) : [];

  // Weigh-in gate status — based on the WHOLE physical race's finish
  // order (not split per age category, even for a combined start), since
  // weighing happens based on who physically crossed the line first, and
  // gating is about whether THIS race is cleared to advance. Applies to
  // mass-start races too now — a boat only gets an OK result once it
  // completes all its laps, so the ranked list below is already exactly
  // who finished, same shape as a lane race. See
  // rules.computeWeighInRequirement for the top-3 rule.
  let weighInStatus = null;
  if (race.status === 'finished') {
    const allEntryIds = Object.values(race.lanes || {}).filter(Boolean);
    const hasPerRace = database.raceWeighIns && allEntryIds.some(id => database.raceWeighIns[`${race.id}:${id}`]);
    const weighedInThisRace = allEntryIds.filter(entryId => {
      if (hasPerRace) return !!(database.raceWeighIns && database.raceWeighIns[`${race.id}:${entryId}`]);
      return !!(database.weighIns && database.weighIns[entryId]);
    });
    const required = Math.min(3, allEntryIds.length);
    const weighedCount = weighedInThisRace.length;
    const complete = weighedCount >= required;
    weighInStatus = {
      complete,
      requiredCount: required,
      weighedCount,
      flag: complete ? null : `${weighedCount} of ${required} weigh-ins done.`,
    };
  }

  return { ...race, laneEntries, results, blindCrossings, weighInStatus };
}

// A race normally belongs to one event (race.eventId). Combined-start
// races (e.g. "MIXED U10-U12 GUPPY" — several age-category events sharing
// one physical start) also carry combinedEventIds, the full list of every
// event pooled into that race. This checks both.
function raceMatchesEvent(race, eventId) {
  return race.eventId === eventId || (race.combinedEventIds && race.combinedEventIds.includes(eventId));
}

// Parse "HH:MM" into minutes-since-midnight — kept for anything that
// still wants a numeric time value, but no longer used for ordering (see
// sortByScheduleThenNumber below).
function scheduleSortKey(race) {
  if (!race.scheduledLabel) return Infinity;
  const m = /^(\d{1,2}):(\d{2})$/.exec(race.scheduledLabel);
  if (!m) return Infinity;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

// The correct display order for a list of races: raceNumber, full stop.
// This used to sort by scheduled TIME first, to handle semis/finals
// created mid-day with a fresh (late) raceNumber but an early rest-gap
// time. That's no longer needed — semi/final slots are now reserved as
// placeholders at DRAW time (see programme.js generate()) and keep their
// original raceNumber when filled in, so raceNumber alone is already the
// correct sequence. Sorting by time instead was actively harmful: moving
// a race (which changes raceNumber) had no visible effect if the race
// already had a scheduledLabel, since time — not raceNumber — was
// deciding the order.
function sortByScheduleThenNumber(races) {
  return [...races].sort((a, b) => a.raceNumber - b.raceNumber);
}

module.exports = { enrichRace, raceMatchesEvent, scheduleSortKey, sortByScheduleThenNumber, getClubCode, autoClubCode };
