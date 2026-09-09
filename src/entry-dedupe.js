// One-off cleanup for duplicate entries created by re-importing the same
// (or an updated) entries file before routes/entries.js checked for this
// — every already-entered athlete got a second boat in the same event.
// New imports can no longer create this (see the existingEntryKeys check
// in routes/entries.js); this just repairs meets that already have it.
// Run once at server startup (see server.js). Safe to run every time —
// a no-op once nothing's duplicated any more.
function dedupeEntries(database) {
  let changed = false;

  const groups = new Map(); // "eventId|sorted athleteIds" -> [entry, ...]
  Object.values(database.entries).forEach((en) => {
    const key = `${en.eventId}|${[...en.athleteIds].sort().join(',')}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(en);
  });

  // Which entries are already drawn into a race — those need care, not
  // just deletion, since a race's lane points at a specific entry id.
  const drawnEntryIds = new Set();
  Object.values(database.races || {}).forEach((race) => {
    Object.values(race.lanes || {}).forEach((entryId) => { if (entryId) drawnEntryIds.add(entryId); });
  });

  groups.forEach((group) => {
    if (group.length <= 1) return; // not a duplicate

    const drawnInGroup = group.filter((e) => drawnEntryIds.has(e.id));
    if (drawnInGroup.length > 1) return; // more than one already drawn in different races — genuinely ambiguous, leave for manual review rather than guess

    // Prefer whichever copy is already drawn (so no race needs touching);
    // otherwise keep the earliest-created copy.
    const keeper = drawnInGroup[0] || group.reduce((a, b) => (Number(a.id) < Number(b.id) ? a : b));

    group.forEach((en) => {
      if (en.id === keeper.id) return;
      // Carry across a weigh-in recorded against the duplicate, if the
      // keeper doesn't already have one, rather than just losing it.
      if (database.weighIns && database.weighIns[en.id] && !database.weighIns[keeper.id]) {
        database.weighIns[keeper.id] = database.weighIns[en.id];
      }
      if (database.weighIns) delete database.weighIns[en.id];
      delete database.entries[en.id];
      changed = true;
    });
  });

  return changed;
}

module.exports = { dedupeEntries };
