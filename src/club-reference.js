// The official PSA "Club codes & Unions" list, baked straight into the
// app (club-reference.json, 80 clubs) — no upload button needed. This
// used to be a file you uploaded by hand in Race Office; now it's just
// always available, so every import can match against it automatically.
//
// If the official list ever changes (new clubs, a renamed union), update
// club-reference.json and ship it in the next zip — same as any other
// code change.
const REFERENCE = require('./club-reference.json');
const { autoClubCode } = require('./present');

// Gauteng Canoe Union (GCU) has been renamed to PSG — translate on the
// way in so the rest of the app only ever sees the current name.
const UNION_RENAME = { GCU: 'PSG' };

const byName = new Map();
REFERENCE.forEach((row) => {
  byName.set(row.club.trim().toLowerCase(), {
    code: row.code,
    union: UNION_RENAME[row.union] || row.union,
  });
});

function lookupOfficial(clubName) {
  if (!clubName) return null;
  return byName.get(String(clubName).trim().toLowerCase()) || null;
}

// Sets every known club's code/union straight from the official
// reference where the name matches. Anything NOT in the reference still
// gets a guessed code (present.js autoClubCode) so Race Office always
// has something to show/edit — it just isn't auto-corrected against an
// official name it doesn't recognise.
//
// Called after every import (routes/entries.js), and once at server
// startup (server.js) so data from before this existed benefits too.
// Safe to call repeatedly — a no-op once everything already matches.
function applyOfficialReference(database) {
  const names = new Set([
    ...Object.values(database.athletes).map((a) => a.club).filter(Boolean),
    ...Object.keys(database.clubCodes),
  ]);
  let changed = false;
  names.forEach((name) => {
    const official = lookupOfficial(name);
    if (official) {
      if (database.clubCodes[name] !== official.code) { database.clubCodes[name] = official.code; changed = true; }
      if (official.union && database.clubUnions[name] !== official.union) { database.clubUnions[name] = official.union; changed = true; }
    } else if (!database.clubCodes[name]) {
      database.clubCodes[name] = autoClubCode(name);
      changed = true;
    }
  });
  return changed;
}

module.exports = { lookupOfficial, applyOfficialReference, REFERENCE };
