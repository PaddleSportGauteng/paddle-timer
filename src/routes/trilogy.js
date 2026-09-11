// Trilogy routes — the 100m handicap shootout series.
// Engine lives in src/trilogy.js; this file is the HTTP layer only.

const express = require('express');
const router  = express.Router();
const db      = require('../db');
const T       = require('../trilogy');
const { normalizeAgeCategory, normalizeGender } = require('./entries');

// ── Meet CRUD ─────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const d = db.load();
  res.json(Object.values(d.trilogyMeets));
});

router.post('/', (req, res) => {
  const d = db.load();
  const id = db.nextId();
  const lanes = Number(req.body.lanes) === 3 ? 3 : 2;
  d.trilogyMeets[id] = {
    id, name: String(req.body.name || '').trim(),
    venueId: req.body.venueId || null,
    courseBearing: req.body.courseBearing || null,
    lanes, date: req.body.date || null,
    seriesNumber: Number(req.body.seriesNumber) || null, // 1, 2 or 3
    createdAt: Date.now(),
  };
  db.save();
  res.json(d.trilogyMeets[id]);
});

router.get('/:id', (req, res) => {
  const d = db.load();
  const m = d.trilogyMeets[req.params.id];
  if (!m) return res.status(404).json({ error: 'Not found' });
  res.json(m);
});

router.delete('/:id', (req, res) => {
  const d = db.load();
  if (!d.trilogyMeets[req.params.id]) return res.status(404).json({ error: 'Not found' });
  delete d.trilogyMeets[req.params.id];
  // cascade
  const pids = Object.values(d.trilogyPaddlers).filter(p => p.meetId === req.params.id).map(p => p.id);
  pids.forEach(id => delete d.trilogyPaddlers[id]);
  Object.keys(d.trilogyRounds).filter(k => d.trilogyRounds[k].meetId === req.params.id).forEach(k => delete d.trilogyRounds[k]);
  db.save();
  res.json({ ok: true });
});

// ── Roster ────────────────────────────────────────────────────────
router.get('/:id/paddlers', (req, res) => {
  const d = db.load();
  const paddlers = Object.values(d.trilogyPaddlers).filter(p => p.meetId === req.params.id)
    .sort((a, b) => a.bib - b.bib);
  res.json(paddlers.map(p => ({ ...p, ...athleteMeta(d, p.athleteId) })));
});

router.post('/:id/paddlers', (req, res) => {
  const d = db.load();
  const meet = d.trilogyMeets[req.params.id];
  if (!meet) return res.status(404).json({ error: 'Meet not found' });
  const existing = Object.values(d.trilogyPaddlers).filter(p => p.meetId === req.params.id);
  const bib = existing.length + 1;
  // Find or create athlete
  let athleteId = req.body.athleteId || null;
  if (!athleteId) {
    const firstName = String(req.body.firstName || '').trim().toUpperCase();
    const surname   = String(req.body.surname   || '').trim().toUpperCase();
    const psaId     = req.body.psaId ? String(req.body.psaId).trim() : null;
    const club      = String(req.body.club || '').trim();
    // dedup on PSA ID first, then exact name
    const found = Object.values(d.athletes).find(a =>
      (psaId && a.psaId === psaId) || (a.firstName === firstName && a.surname === surname));
    if (found) { athleteId = found.id; }
    else {
      athleteId = db.nextId();
      d.athletes[athleteId] = { id: athleteId, firstName, surname, club, psaId };
    }
  }
  const id = db.nextId();
  d.trilogyPaddlers[id] = {
    id, meetId: req.params.id, athleteId, bib,
    ageCategory: normalizeAgeCategory(req.body.ageCategory),
    sex: normalizeGender(req.body.sex),
    clubCode: String(req.body.clubCode || req.body.club || '').trim().toUpperCase().slice(0, 6),
  };
  db.save();
  res.json({ ...d.trilogyPaddlers[id], ...athleteMeta(d, athleteId) });
});

router.patch('/:id/paddlers/:pid', (req, res) => {
  const d = db.load();
  const p = d.trilogyPaddlers[req.params.pid];
  if (!p || p.meetId !== req.params.id) return res.status(404).json({ error: 'Not found' });
  if (req.body.ageCategory !== undefined) p.ageCategory = normalizeAgeCategory(req.body.ageCategory);
  if (req.body.sex        !== undefined) p.sex          = normalizeGender(req.body.sex);
  if (req.body.clubCode   !== undefined) p.clubCode     = String(req.body.clubCode).trim().toUpperCase().slice(0, 6);
  if (req.body.bib        !== undefined) p.bib          = Number(req.body.bib);
  db.save();
  res.json({ ...p, ...athleteMeta(d, p.athleteId) });
});

router.delete('/:id/paddlers/:pid', (req, res) => {
  const d = db.load();
  const p = d.trilogyPaddlers[req.params.pid];
  if (!p || p.meetId !== req.params.id) return res.status(404).json({ error: 'Not found' });
  delete d.trilogyPaddlers[req.params.pid];
  db.save();
  res.json({ ok: true });
});

// ── Import from PSA entries sheet ─────────────────────────────────
const multer = require('multer');
const XLSX   = require('xlsx');
const upload = multer({ storage: multer.memoryStorage() });

router.post('/:id/import', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  const d = db.load();
  const meet = d.trilogyMeets[req.params.id];
  if (!meet) return res.status(404).json({ error: 'Meet not found' });
  const wb    = XLSX.read(req.file.buffer, { type: 'buffer' });
  const shName = wb.SheetNames.find(n => /system race data/i.test(n)) || wb.SheetNames[0];
  const rows  = XLSX.utils.sheet_to_json(wb.Sheets[shName], { header: 1, defval: null });
  const hdrIdx = rows.findIndex(r => r && r[0] === 'RACE NAME');
  if (hdrIdx < 0) return res.status(400).json({ error: 'No RACE NAME header row found.' });
  const hdr = rows[hdrIdx];
  const col = {};
  ['K1 MEMBER','K1 PSA ID','K1 AGE CATEGORY','K1 GENDER','K1 CLUB'].forEach(k => {
    col[k] = hdr.indexOf(k);
  });
  const existing = Object.values(d.trilogyPaddlers).filter(p => p.meetId === req.params.id);
  let added = 0, skipped = 0;
  const nextBib = () => Object.values(d.trilogyPaddlers).filter(p => p.meetId === req.params.id).length + 1;

  rows.slice(hdrIdx + 1).forEach(row => {
    if (!row[col['K1 MEMBER']]) return;
    const firstName = String(row[col['K1 MEMBER']]).trim().toUpperCase().split(/\s+/)[0];
    const surname   = String(row[col['K1 MEMBER']]).trim().toUpperCase().split(/\s+/).slice(1).join(' ');
    const psaId     = row[col['K1 PSA ID']] ? String(row[col['K1 PSA ID']]).trim() : null;
    const ageCategory = normalizeAgeCategory(row[col['K1 AGE CATEGORY']]);
    const sex       = normalizeGender(row[col['K1 GENDER']]);
    const club      = String(row[col['K1 CLUB']] || '').trim().toUpperCase().slice(0, 6);
    // dedup
    let athlete = Object.values(d.athletes).find(a => psaId && a.psaId === psaId)
      || Object.values(d.athletes).find(a => a.firstName === firstName && a.surname === surname);
    if (!athlete) {
      const aid = db.nextId();
      d.athletes[aid] = { id: aid, firstName, surname, club, psaId };
      athlete = d.athletes[aid];
    }
    const alreadyIn = Object.values(d.trilogyPaddlers).some(p => p.meetId === req.params.id && p.athleteId === athlete.id);
    if (alreadyIn) { skipped++; return; }
    const pid = db.nextId();
    d.trilogyPaddlers[pid] = { id: pid, meetId: req.params.id, athleteId: athlete.id, bib: nextBib(), ageCategory, sex, clubCode: club };
    added++;
  });
  db.save();
  res.json({ added, skipped });
});

// ── Draw generation ───────────────────────────────────────────────
router.post('/:id/draw/:round', (req, res) => {
  const d = db.load();
  const meet = d.trilogyMeets[req.params.id];
  if (!meet) return res.status(404).json({ error: 'Meet not found' });
  const roundNum = Number(req.params.round);
  if (roundNum < 1 || roundNum > 6) return res.status(400).json({ error: 'Round must be 1–6.' });

  const paddlers = Object.values(d.trilogyPaddlers)
    .filter(p => p.meetId === req.params.id)
    .map(p => ({ ...p, ...athleteMeta(d, p.athleteId) }));
  if (!paddlers.length) return res.status(400).json({ error: 'No paddlers on this roster.' });

  // Collect existing round times
  const timeByPaddler = {};    // paddlerId → { r1, r2 }
  const posByPaddler  = {};    // paddlerId → { roundNum → position }
  const prevHistory   = {};    // built from all completed rounds

  Object.values(d.trilogyRounds).filter(r => r.meetId === req.params.id).forEach(rd => {
    rd.races.forEach(race => {
      T.recordMeetings(prevHistory, race.lanes.map(l => l.paddlerId));
      race.lanes.forEach(l => {
        if (rd.roundNumber === 1) { timeByPaddler[l.paddlerId] = timeByPaddler[l.paddlerId] || {}; timeByPaddler[l.paddlerId].r1 = l.timeMs; }
        if (rd.roundNumber === 2) { timeByPaddler[l.paddlerId] = timeByPaddler[l.paddlerId] || {}; timeByPaddler[l.paddlerId].r2 = l.timeMs; }
        if (l.position) { posByPaddler[l.paddlerId] = posByPaddler[l.paddlerId] || {}; posByPaddler[l.paddlerId][rd.roundNumber] = l.position; }
      });
    });
  });

  const tuById = {};
  paddlers.forEach(p => { const t = timeByPaddler[p.id] || {}; tuById[p.id] = T.timeUsed(t.r1, t.r2); });

  let races;
  if (roundNum === 1) {
    races = T.drawRound1(paddlers);
  } else if (roundNum === 2) {
    const r1Times = {};
    paddlers.forEach(p => { r1Times[p.id] = (timeByPaddler[p.id] || {}).r1 || 0; });
    races = T.drawRound2(paddlers, r1Times, prevHistory);
  } else {
    const prevPos = {};
    paddlers.forEach(p => { prevPos[p.id] = (posByPaddler[p.id] || {})[roundNum - 1]; });
    races = T.drawRound(paddlers, prevPos, tuById, prevHistory);
  }

  const roundId = db.nextId();
  d.trilogyRounds[roundId] = {
    id: roundId, meetId: req.params.id, roundNumber: roundNum,
    locked: false,
    races: races.map(r => ({
      raceNumber: r.raceNumber, timed: r.timed, rematch: r.rematch,
      lanes: r.lanes.map(l => ({ ...l, timeMs: null, position: null })),
    })),
  };
  db.save();
  res.json(d.trilogyRounds[roundId]);
});

// ── Record results for a round ────────────────────────────────────
router.patch('/:id/rounds/:roundId/race/:raceNum/lane/:lane', (req, res) => {
  const d = db.load();
  const rd = d.trilogyRounds[req.params.roundId];
  if (!rd || rd.meetId !== req.params.id) return res.status(404).json({ error: 'Round not found' });
  const race = rd.races.find(r => r.raceNumber === Number(req.params.raceNum));
  if (!race) return res.status(404).json({ error: 'Race not found' });
  const lane = race.lanes.find(l => l.lane === Number(req.params.lane));
  if (!lane) return res.status(404).json({ error: 'Lane not found' });
  if (req.body.timeMs   !== undefined) lane.timeMs   = req.body.timeMs;
  if (req.body.position !== undefined) lane.position = req.body.position;
  db.save();
  res.json(rd);
});

router.post('/:id/rounds/:roundId/lock', (req, res) => {
  const d = db.load();
  const rd = d.trilogyRounds[req.params.roundId];
  if (!rd || rd.meetId !== req.params.id) return res.status(404).json({ error: 'Round not found' });
  rd.locked = true;
  db.save();
  res.json({ ok: true });
});

// ── Round list (used by the front end) ────────────────────────────
router.get('/:id/rounds-list', (req, res) => {
  const d = db.load();
  const rds = Object.values(d.trilogyRounds).filter(r => r.meetId === req.params.id)
    .sort((a, b) => a.roundNumber - b.roundNumber);
  res.json(rds);
});

// Get a single round (for partial refresh after position save)
router.get('/:id/rounds/:roundId-get', (req, res) => {
  const d = db.load();
  const rd = d.trilogyRounds[req.params.roundId];
  if (!rd || rd.meetId !== req.params.id) return res.status(404).json({ error: 'Not found' });
  res.json(rd);
});

// ── Standings ─────────────────────────────────────────────────────
router.get('/:id/standings', (req, res) => {
  const d = db.load();
  const meet = d.trilogyMeets[req.params.id];
  if (!meet) return res.status(404).json({ error: 'Not found' });
  const paddlers = Object.values(d.trilogyPaddlers)
    .filter(p => p.meetId === req.params.id)
    .map(p => ({ ...p, ...athleteMeta(d, p.athleteId) }));
  const timeByPaddler = {}, posByPaddler = {};
  Object.values(d.trilogyRounds).filter(r => r.meetId === req.params.id).forEach(rd => {
    rd.races.forEach(race => {
      race.lanes.forEach(l => {
        if (rd.roundNumber === 1) { timeByPaddler[l.paddlerId] = timeByPaddler[l.paddlerId] || {}; timeByPaddler[l.paddlerId].r1 = l.timeMs; }
        if (rd.roundNumber === 2) { timeByPaddler[l.paddlerId] = timeByPaddler[l.paddlerId] || {}; timeByPaddler[l.paddlerId].r2 = l.timeMs; }
        if (l.position) { posByPaddler[l.paddlerId] = posByPaddler[l.paddlerId] || {}; posByPaddler[l.paddlerId][rd.roundNumber] = l.position; }
      });
    });
  });
  const tuById = {};
  paddlers.forEach(p => { const t = timeByPaddler[p.id] || {}; tuById[p.id] = T.timeUsed(t.r1, t.r2); });
  const result = T.standings(paddlers, posByPaddler, tuById);
  res.json(result);
});

// ── Helper ────────────────────────────────────────────────────────
function athleteMeta(d, athleteId) {
  const a = d.athletes[athleteId] || {};
  return { name: [a.firstName, a.surname].filter(Boolean).join(' '), psaId: a.psaId || null };
}

module.exports = router;
