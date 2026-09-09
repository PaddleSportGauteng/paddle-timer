// Lightweight JSON "database".
//
// On Render's free tier there is no persistent disk — writes survive the
// session but are wiped on redeploy/restart. That's fine for race day use:
// the meet runs, data lives in memory, results are exported/printed before
// anyone restarts the server. We try to write to disk (data/db.json) but
// catch any filesystem error silently so the app still works on Render.

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'db.json');

const EMPTY_DB = {
  nextId: 1,
  meets: {},
  athletes: {},
  events: {},
  entries: {},
  races: {},
  raceResults: {},
  blindCrossings: {},
  lapPasses: {},
  weighIns: {},
  clubCodes: {},
  clubUnions: {},
  breaks: {},
};

let db = null;

function load() {
  if (db) return db;
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    db = JSON.parse(raw);
  } catch (e) {
    db = JSON.parse(JSON.stringify(EMPTY_DB));
    save();
  }
  return db;
}

function save() {
  try {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
  } catch (e) {
    // No persistent disk (e.g. Render free tier) — data lives in memory only.
    // Fine for race day: import → race → export results before any restart.
  }
}

function nextId() {
  const id = db.nextId++;
  save();
  return String(id);
}

function reset() {
  db = JSON.parse(JSON.stringify(EMPTY_DB));
  save();
  return db;
}

module.exports = { load, save, nextId, reset, get DATA_FILE() { return DATA_FILE; } };
