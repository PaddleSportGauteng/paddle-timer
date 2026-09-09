// Known inconsistent spellings seen in real PSA entry sheets, where the
// CLUB column sometimes holds a short code instead of the club's actual
// name — it's the same real club either way, just typed differently on
// different rows/imports.
//
// Values here are always the club's real, full NAME (matching the "Club"
// column of the official PSA reference in club-reference.json) — never a
// code — so club-reference.js can match it and set the right official
// code/union automatically. Add more pairs as they turn up. Keys are
// matched case-insensitively.
const CLUB_ALIASES = {
  DAB: 'Dabulamanzi Canoe Club',
  DABS: 'Dabulamanzi Canoe Club',  // the official code itself also turns up as the raw value sometimes
  SOW: 'Soweto Canoe Club',
  SCARC: 'Soweto Canoe Club',
};

// Applied to a club value the moment it comes off an imported sheet (see
// routes/entries.js), so new data is correct from the start — an alias
// never gets the chance to become its own separate "club" in the system.
function normalizeClubName(raw) {
  if (!raw) return raw;
  const trimmed = String(raw).trim();
  const canonical = CLUB_ALIASES[trimmed.toUpperCase()];
  return canonical || trimmed;
}

// One-off cleanup for data imported BEFORE an alias was added to the list
// above, so existing meets don't need a manual re-import or a manual
// "Merge into this ->" click to pick up a newly-added alias. Run once at
// server startup (see server.js). Cheap, and a no-op once everything's
// already been fixed — safe to run every time the app starts.
function migrateClubAliases(database) {
  let changed = false;
  Object.entries(CLUB_ALIASES).forEach(([alias, canonical]) => {
    Object.values(database.athletes).forEach((a) => {
      if (a.club && a.club.trim().toUpperCase() === alias) {
        a.club = canonical;
        changed = true;
      }
    });
    // Drop any code recorded against the raw alias itself (e.g. from an
    // import that happened before this list existed) — the canonical name
    // keeps/gets its own code via present.js as normal. A union recorded
    // against the alias carries over to the canonical name first, rather
    // than just being discarded, unless the canonical already has one.
    Object.keys(database.clubUnions).forEach((name) => {
      if (name.trim().toUpperCase() === alias) {
        if (!database.clubUnions[canonical]) database.clubUnions[canonical] = database.clubUnions[name];
        delete database.clubUnions[name];
        changed = true;
      }
    });
    Object.keys(database.clubCodes).forEach((name) => {
      if (name.trim().toUpperCase() === alias) { delete database.clubCodes[name]; changed = true; }
    });
  });
  return changed;
}

module.exports = { CLUB_ALIASES, normalizeClubName, migrateClubAliases };
