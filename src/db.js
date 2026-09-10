// Lightweight JSON "database".
// Data is stored on Render's persistent disk at /opt/render/project/src/data/db.json
// This path survives redeploys. Falls back to the local data/ folder for local dev.

const fs = require('fs');
const path = require('path');

// Render persistent disk mounts at /opt/render/project/src/data
// For local development it falls back to ./data/db.json
const DISK_PATH = '/opt/render/project/src/data';
const DATA_DIR = fs.existsSync(DISK_PATH) ? DISK_PATH : path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');

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
    console.error('db save error:', e.message);
  }
}

function nextId() {
  const id = db.nextId++;
  save();
  return String(id);
}

module.exports = { load, save, nextId, get DATA_FILE() { return DATA_FILE; } };
