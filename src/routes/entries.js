const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const db = require('../db');
const { normalizeClubName } = require('../club-aliases');
const { applyOfficialReference, lookupOfficial } = require('../club-reference');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// --- Parsing helpers, built against the real "System Race data" sheet ---

function extractDistance(raceName) {
  // Race names also contain a date ("15 March 2026"), so match digits with
  // AT MOST one space before the unit, and take the LAST match in the
  // string (distance comes after the date in every sample we've seen) —
  // otherwise "2026 200M" greedily reads as one number.
  const matches = [...raceName.toUpperCase().replace(/,/g, '').matchAll(/(\d{1,5})\s?(KM|M)\b/g)];
  if (matches.length === 0) return null;
  const m = matches[matches.length - 1];
  const val = parseInt(m[1], 10);
  const meters = /KM/.test(m[2]) ? val * 1000 : val;
  return `${meters}m`;
}

const BOAT_TOKENS = ['K4', 'K3', 'K2', 'K1', 'C4', 'C2', 'C1']; // check K4/K3/C4 before K1/C1 substrings

function extractBoatClassInfo(raceName) {
  const upper = raceName.toUpperCase();
  const hasGuppy = /GUPPY/.test(upper);
  const token = BOAT_TOKENS.find((t) => new RegExp(`\\b${t}\\b`).test(upper)) || null;
  if (token && hasGuppy) {
    // e.g. "500M K1 & GUPPY" — the sheet doesn't tell us, per row, which of
    // these two classes a given boat actually is. Flag it rather than guess.
    return { boatClass: token, ambiguousWithGuppy: true };
  }
  if (hasGuppy) return { boatClass: 'Guppy', ambiguousWithGuppy: false };
  if (token) return { boatClass: token, ambiguousWithGuppy: false };
  return { boatClass: 'Unknown', ambiguousWithGuppy: false };
}

function findHeaderRow(rows) {
  for (let i = 0; i < rows.length; i++) {
    if (rows[i] && rows[i][0] === 'RACE NAME') return i;
  }
  return -1;
}

// Age category ("U18", "SNR"...) and gender ("M"/"F") are short codes that
// should be identical every time the same category appears — but sheets
// sometimes have a stray trailing space, or different case, on different
// rows/imports. Left un-normalized, that silently creates a SECOND event
// with a different key but an identical-looking label (e.g. "U18" and
// "u18 " both render as "U18"), which then confuses anything that
// searches/matches by label text rather than event id (see race-sort.html
// "Fix entries here"). Trim + uppercase so the same category always
// produces the same key.
function normalizeCategoryValue(raw) {
  if (raw == null) return null;
  const clean = String(raw).trim().toUpperCase().replace(/\s+/g, ' ');
  return clean || null;
}

function findOrCreateAthlete(database, seat) {
  const existing = Object.values(database.athletes).find(
    (a) => a.psaId && seat.psaId && a.psaId === seat.psaId
  );
  if (existing) return existing.id;
  const id = db.nextId();
  database.athletes[id] = {
    id,
    firstName: seat.name || '',
    psaId: seat.psaId || null,
    dob: seat.dob || null,
    gender: seat.gender || null,
    club: seat.club || null,
    ageCategory: seat.ageCategory || null,
  };
  return id;
}

router.post('/import', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const meetId = req.body.meetId;
  const database = db.load();
  const meet = database.meets[meetId];
  if (!meet) return res.status(400).json({ error: 'Pick a meet before importing (top of page).' });

  let workbook;
  try {
    workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
  } catch (e) {
    return res.status(400).json({ error: `Could not read spreadsheet: ${e.message}` });
  }

  const sheetName = workbook.SheetNames.find((n) => /system race data/i.test(n)) || workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });

  const headerIdx = findHeaderRow(rows);
  if (headerIdx === -1) {
    return res.status(400).json({ error: `Couldn't find a "RACE NAME" header row in sheet "${sheetName}". Is this the entries export?` });
  }
  const header = rows[headerIdx];
  const col = {};
  header.forEach((h, i) => { if (h) col[h] = i; });

  const flagSet = new Set();
  const summary = { rowsRead: 0, entriesCreated: 0, duplicatesSkipped: 0, athletesCreated: 0, eventsCreated: 0, get flags() { return [...flagSet]; } };
  const eventKeyToId = {};
  // index existing events for THIS MEET by key so re-imports don't duplicate
  Object.values(database.events).filter((ev) => ev.meetId === meetId).forEach((ev) => { eventKeyToId[ev._key] = ev.id; });

  // Index existing entries for THIS MEET the same way — events and
  // athletes already deduped on re-import (above / findOrCreateAthlete),
  // but entries themselves didn't: re-uploading the same or an updated
  // file created a second boat for every athlete already entered. A boat
  // is the same boat if it's in the same event with the exact same set
  // of athletes (order doesn't matter for a crew), so that's the key.
  const existingEntryKeys = new Set();
  Object.values(database.entries).forEach((en) => {
    const ev = database.events[en.eventId];
    if (ev && ev.meetId === meetId) existingEntryKeys.add(`${en.eventId}|${[...en.athleteIds].sort().join(',')}`);
  });

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    const raceName = row[col['RACE NAME']];
    if (!raceName) continue;
    summary.rowsRead++;

    const distance = extractDistance(raceName);
    const { boatClass, ambiguousWithGuppy } = extractBoatClassInfo(raceName);
    if (!distance) { flagSet.add(`Couldn't parse a distance from "${raceName}" — skipped (row ${r + 1}+).`); continue; }
    if (boatClass === 'Unknown') { flagSet.add(`Couldn't parse a boat class from "${raceName}" — skipped (row ${r + 1}+).`); continue; }

    // Gather crew seats K1..K4 present on this row
    const seats = [];
    for (const slot of ['K1', 'K2', 'K3', 'K4']) {
      const rawName = row[col[`${slot} MEMBER`]];
      const name = (rawName == null ? '' : String(rawName)).trim();
      if (!name) continue;
      seats.push({
        name,
        psaId: row[col[`${slot} PSA ID`]] || null,
        dob: row[col[`${slot} DATE OF BIRTH`]] || null,
        gender: normalizeCategoryValue(row[col[`${slot} GENDER`]]),
        club: normalizeClubName(row[col[`${slot} CLUB`]]) || null,
        ageCategory: normalizeCategoryValue(row[col[`${slot} AGE CATEGORY`]]),
      });
    }
    if (seats.length === 0) { flagSet.add(`Some rows have no crew members and were skipped (row ${r + 1}+).`); continue; }

    // Crew age category / gender: flag disagreement instead of guessing silently
    const ageCats = [...new Set(seats.map((s) => s.ageCategory).filter(Boolean))];
    const genders = [...new Set(seats.map((s) => s.gender).filter(Boolean))];
    if (ageCats.length > 1) flagSet.add(`Crew(s) in "${raceName}" have mixed age categories (${ageCats.join(', ')}) — needs organiser call (e.g. row ${r + 1}).`);
    if (genders.length > 1) flagSet.add(`Crew(s) in "${raceName}" have mixed genders — flag for mixed-crew handling (e.g. row ${r + 1}).`);
    if (ambiguousWithGuppy) flagSet.add(`"${raceName}" mixes "${boatClass}" and "Guppy" in one race name — can't tell which individual boats are Guppy class from this sheet alone. All defaulted to ${boatClass}; please confirm per-athlete boat class before finals/medals.`);

    const ageCategory = ageCats[0] || 'Unknown';
    const gender = genders[0] || 'Unknown';
    const eventKey = `${distance}|${boatClass}|${ageCategory}|${gender}`;

    let eventId = eventKeyToId[eventKey];
    if (!eventId) {
      eventId = db.nextId();
      database.events[eventId] = {
        id: eventId, meetId, _key: eventKey, distance, boatClass, ageCategory, gender,
        label: `${distance} ${boatClass} ${ageCategory} ${gender}`,
        isMassStart: distance === '2000m' || distance === '5000m',
        day: 1,
      };
      eventKeyToId[eventKey] = eventId;
      summary.eventsCreated++;
    }

    const athleteIds = seats.map((seat) => {
      const before = Object.keys(database.athletes).length;
      const id = findOrCreateAthlete(database, seat);
      if (Object.keys(database.athletes).length > before) summary.athletesCreated++;
      return id;
    });

    const entryKey = `${eventId}|${[...athleteIds].sort().join(',')}`;
    if (existingEntryKeys.has(entryKey)) {
      summary.duplicatesSkipped++;
      continue;
    }
    existingEntryKeys.add(entryKey);

    const entryId = db.nextId();
    database.entries[entryId] = { id: entryId, eventId, athleteIds, status: 'active', boatNumber: null };
    summary.entriesCreated++;
  }

  // Set every club's code/union straight from the official PSA reference
  // where the name matches (src/club-reference.js) — no manual upload
  // step. Anything not in the reference still gets a guessed code so
  // Race Office has something to show/edit before anything gets drawn.
  applyOfficialReference(database);

  db.save();
  res.json(summary);
});

function enrichEntry(database, entry) {
  const event = database.events[entry.eventId];
  const names = entry.athleteIds.map((aid) => {
    const a = database.athletes[aid];
    return a ? `${a.firstName} ${a.surname || ''}`.trim() : '?';
  });
  return { ...entry, eventLabel: event ? event.label : '(unknown event)', boatClass: event ? event.boatClass : null, names };
}

router.get('/', (req, res) => {
  const database = db.load();
  const q = (req.query.q || '').toLowerCase().trim();
  const meetId = req.query.meetId;
  let list = Object.values(database.entries)
    .filter((e) => !meetId || (database.events[e.eventId] && database.events[e.eventId].meetId === meetId))
    .map((e) => enrichEntry(database, e));
  if (q) {
    list = list.filter((e) => e.names.join(' ').toLowerCase().includes(q) || e.eventLabel.toLowerCase().includes(q));
  }
  res.json(list);
});

// Every club name seen so far, with its code and (if known) union. Set
// automatically from the official PSA reference on import (see
// club-reference.js applyOfficialReference) where the name matches, or a
// guessed code otherwise — editable below either way. Global, not
// meet-scoped — codes/unions are a stable identity, not tied to one meet.
router.get('/club-codes', (req, res) => {
  const database = db.load();
  const out = {};
  Object.keys(database.clubCodes).forEach((name) => {
    out[name] = { code: database.clubCodes[name], union: database.clubUnions[name] || null };
  });
  res.json(out);
});

router.patch('/club-codes', (req, res) => {
  const database = db.load();
  const { clubName, code } = req.body;
  if (!clubName || !code) return res.status(400).json({ error: 'clubName and code are required.' });
  const clean = String(code).toUpperCase().trim().slice(0, 6);
  if (!clean) return res.status(400).json({ error: 'Code cannot be empty.' });
  database.clubCodes[clubName] = clean;
  db.save();
  res.json({ clubName, code: clean });
});

module.exports = router;
