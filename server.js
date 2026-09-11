const express = require('express');
const path = require('path');
const os = require('os');
const db = require('./src/db');
const { migrateClubAliases } = require('./src/club-aliases');
const { applyOfficialReference } = require('./src/club-reference');
const { dedupeEntries } = require('./src/entry-dedupe');

// Fix any club-code aliases (e.g. "DAB" -> "DABS", "SOW" -> "SCARC") left
// over in data imported before those aliases were added, set every club's
// code/union from the official reference where it matches, and merge any
// duplicate entries created by re-importing an entries file before that
// was checked for. New imports already avoid all three (see
// routes/entries.js) — this just catches up data from before they did.
{
  const database = db.load();
  const aliasesFixed = migrateClubAliases(database);
  const referenceApplied = applyOfficialReference(database);
  const entriesDeduped = dedupeEntries(database);
  if (aliasesFixed || referenceApplied || entriesDeduped) {
    db.save();
    console.log('Refreshed club codes/unions and removed any duplicate entries from past re-imports.');
  }
}

const app = express();
app.use(express.json());
// This app gets updated (a new zip re-downloaded and re-extracted) far
// more often than it needs fast repeat-load performance — and it's a
// local-network app, so the extra bytes cost nothing. Disabling caching
// entirely avoids an entire class of "I updated but nothing changed"
// confusion where the browser silently keeps serving an old cached JS
// file alongside new HTML that expects functions the old file doesn't
// have yet (looks like "the page opens but buttons don't work").
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  lastModified: false,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  },
}));

app.use('/api/meets', require('./src/routes/meets'));
app.use('/api/entries', require('./src/routes/entries'));
app.use('/api/programme', require('./src/routes/programme'));
app.use('/api/races', require('./src/routes/races'));
app.use('/api/results', require('./src/routes/results'));
app.use('/api/export', require('./src/routes/export'));
app.use('/api/export', require('./src/routes/export-draws'));
app.use('/api/export', require('./src/routes/export-results'));
app.use('/api/trilogy', require('./src/routes/trilogy'));

app.get('/api/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, '0.0.0.0', () => {
  const nets = os.networkInterfaces();
  const addrs = Object.values(nets).flat().filter((n) => n.family === 'IPv4' && !n.internal).map((n) => n.address);
  console.log(`\nPaddle Timer running.`);
  console.log(`  On this laptop:  http://localhost:${PORT}`);
  addrs.forEach((a) => console.log(`  On the network:  http://${a}:${PORT}   <-- open this on phones/tablets`));
  console.log('');
});
