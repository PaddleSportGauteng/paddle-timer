const express = require('express');
const PDFDocument = require('pdfkit');
const db = require('../db');
const { enrichRace, sortByScheduleThenNumber } = require('../present');

const router = express.Router();

const PHASE_LABELS = { heat: 'Heat', semi: 'Semifinal', final: 'Final', finalB: 'Final B', finalC: 'Final C' };

function raceDescription(race) {
  const eventLabel = race.combinedLabel || (race.event ? race.event.label : '');
  let phaseText = PHASE_LABELS[race.phase] || race.phase;
  if (race.phase === 'heat' || race.phase === 'semi') phaseText += ` ${race.heatNumber}`;
  let desc = `${eventLabel} ${phaseText}`;
  if (race.isMassStart) desc += ` (mass start, ${race.totalLaps} laps)`;
  if (race.overridden) desc += ' [OVERRIDDEN]';
  if (race.placeholder) desc += ' [TBC]';
  return desc;
}

// "Leave for start" — when boats should head from marshaling to the start
// line, a fixed number of minutes before the race's start time (default
// 20, matching the reference programme this format was built from).
function leaveForStart(scheduledLabel, leadMinutes) {
  if (!scheduledLabel) return '';
  const m = /^(\d{1,2}):(\d{2})$/.exec(scheduledLabel);
  if (!m) return '';
  let total = parseInt(m[1], 10) * 60 + parseInt(m[2], 10) - leadMinutes;
  if (total < 0) total += 24 * 60;
  const h = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

router.get('/programme.pdf', (req, res) => {
  const database = db.load();
  const meetId = req.query.meetId;
  const dayFilter = req.query.day ? Number(req.query.day) : null;
  const leadMinutes = req.query.leadMinutes ? Number(req.query.leadMinutes) : 20;
  const meet = database.meets[meetId];

  const eventIds = new Set(
    Object.values(database.events)
      .filter((e) => (!meetId || e.meetId === meetId) && (!dayFilter || (e.day || 1) === dayFilter))
      .map((e) => e.id)
  );
  const races = sortByScheduleThenNumber(
    Object.values(database.races).filter((r) => eventIds.has(r.eventId))
  ).map((r) => enrichRace(database, { ...r, event: database.events[r.eventId] }));

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="programme${dayFilter ? '-day' + dayFilter : ''}.pdf"`);
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');

  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  doc.pipe(res);

  doc.fontSize(18).font('Helvetica-Bold').text(meet ? meet.name : 'Race Programme', { align: 'center' });
  doc.fontSize(11).font('Helvetica').fillColor('#666')
    .text(dayFilter ? `Day ${dayFilter}` : 'Running order', { align: 'center' });
  doc.fontSize(9)
    .text(`Generated ${new Date().toLocaleString()} — snapshot, not live. Re-download after any change.`, { align: 'center' });
  doc.moveDown(1);
  doc.fillColor('#000');

  if (races.length === 0) {
    doc.fontSize(11).fillColor('#666').text('No races have been generated yet.');
    doc.end();
    return;
  }

  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const pageW = right - left;

  // Lane table columns — same order as every screen:
  // LANE · NAME · AGE · CLUB · M/F · UNION · PSA # · TIME
  const cols = [
    { key: 'lane',  label: 'LANE',  w: 40 },
    { key: 'name',  label: 'NAME',  w: 0 },   // flex
    { key: 'age',   label: 'AGE',   w: 44 },
    { key: 'club',  label: 'CLUB',  w: 48 },
    { key: 'sex',   label: 'M/F',   w: 30 },
    { key: 'union', label: 'UNION', w: 46 },
    { key: 'psa',   label: 'PSA #', w: 52 },
    { key: 'time',  label: 'TIME',  w: 60 },
  ];
  const fixedW = cols.reduce((s, col) => s + col.w, 0);
  cols.find((col) => col.key === 'name').w = pageW - fixedW;
  let x = left;
  cols.forEach((col) => { col.x = x; x += col.w; });

  const rowH = 14;
  const gl = (g) => g ? (g.toLowerCase().startsWith('f') ? 'F' : g.toLowerCase().startsWith('m') ? 'M' : g) : '';
  const fmtMs = (ms) => {
    if (ms == null) return '';
    const cs = Math.floor(ms / 10) % 100, s = Math.floor(ms / 1000) % 60, m = Math.floor(ms / 60000);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
  };

  function ensureRoom(h) {
    if (doc.y + h > doc.page.height - doc.page.margins.bottom) doc.addPage();
  }

  function drawLaneHeader() {
    const y = doc.y;
    doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#6B7480');
    cols.forEach((col) => doc.text(col.label, col.x + 3, y, { width: col.w - 6, lineBreak: false }));
    doc.y = y + 11;
    doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor('#D8DCE0').lineWidth(1).stroke();
    doc.y += 2;
  }

  let currentDay = null;
  races.forEach((race) => {
    const lanes = Object.entries(race.laneEntries || {}).sort((a, b) => Number(a[0]) - Number(b[0]));
    const blockH = 24 + 13 + lanes.length * rowH + 8;
    ensureRoom(Math.min(blockH, 120));

    // Day separator
    if ((race.day || 1) !== currentDay) {
      currentDay = race.day || 1;
      doc.rect(left, doc.y, pageW, 16).fill('#0B2540');
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#fff').text(`DAY ${currentDay}`, left + 6, doc.y + 4, { lineBreak: false });
      doc.y += 20;
      doc.fillColor('#000');
    }

    // Race title row
    const y = doc.y;
    const desc = raceDescription(race);
    const time = race.scheduledLabel || 'TBC';
    const leave = leaveForStart(race.scheduledLabel, leadMinutes);
    doc.fontSize(10.5).font('Helvetica-Bold').fillColor('#0B2540');
    doc.text(`R${race.raceNumber}`, left, y, { width: 34, lineBreak: false });
    doc.fillColor(race.placeholder ? '#999' : (race.overridden ? '#C93B3B' : '#0B2540'));
    doc.text(desc, left + 36, y, { width: pageW - 36 - 140, lineBreak: false });
    doc.font('Helvetica').fillColor('#E2662D');
    doc.text(`Start ${time}`, right - 140, y, { width: 70, align: 'right', lineBreak: false });
    doc.fillColor('#6B7480');
    doc.text(leave ? `Leave ${leave}` : '', right - 66, y, { width: 66, align: 'right', lineBreak: false });
    doc.y = y + 15;

    if (lanes.length === 0) {
      doc.fontSize(8).font('Helvetica-Oblique').fillColor('#999').text('No lanes assigned yet.', left + 4, doc.y);
      doc.y += 14;
    } else {
      drawLaneHeader();
      doc.fontSize(8.5).font('Helvetica').fillColor('#000');
      lanes.forEach(([lane, info], i) => {
        ensureRoom(rowH);
        const ry = doc.y;
        if (i % 2 === 1) doc.rect(left, ry - 2, pageW, rowH).fill('#F3F6FA');
        doc.fillColor('#000');
        if (!info) {
          doc.font('Helvetica').fillColor('#6B7480');
          doc.text(`${race.isMassStart ? 'S' : 'L'}${lane}`, cols[0].x + 3, ry, { width: cols[0].w - 6, lineBreak: false });
          doc.text('—', cols[1].x + 3, ry, { width: cols[1].w - 6, lineBreak: false });
        } else {
          const r = race.results && race.results[info.entryId];
          const timeStr = r ? (r.status === 'OK' ? fmtMs(r.finishTimeMs) : r.status) : '';
          const name = (info.names || []).join(' / ').toUpperCase();
          doc.font('Helvetica-Bold').fillColor('#6B7480');
          doc.text(`${race.isMassStart ? 'S' : 'L'}${lane}`, cols[0].x + 3, ry, { width: cols[0].w - 6, lineBreak: false });
          doc.fillColor('#000');
          doc.text(name, cols[1].x + 3, ry, { width: cols[1].w - 6, lineBreak: false, ellipsis: true });
          doc.font('Helvetica').fillColor('#6B7480');
          doc.text(info.ageCategory || '', cols[2].x + 3, ry, { width: cols[2].w - 6, lineBreak: false });
          doc.text(info.clubCode || '', cols[3].x + 3, ry, { width: cols[3].w - 6, lineBreak: false });
          doc.text(gl(info.gender), cols[4].x + 3, ry, { width: cols[4].w - 6, lineBreak: false });
          doc.text(info.union || '', cols[5].x + 3, ry, { width: cols[5].w - 6, lineBreak: false });
          doc.text((info.psaIds || [])[0] || '', cols[6].x + 3, ry, { width: cols[6].w - 6, lineBreak: false });
          doc.font('Helvetica-Bold').fillColor(r && r.status === 'OK' ? '#1E8E5A' : '#C93B3B');
          doc.text(timeStr, cols[7].x + 3, ry, { width: cols[7].w - 6, align: 'right', lineBreak: false });
        }
        doc.y = ry + rowH;
      });
    }
    doc.y += 10;
    doc.fillColor('#000');
  });

  doc.end();
});

// Compact planning sheet — one line per race, blank time box, for printing
// and writing on. Sorted by day then race number, with day separator headers.
router.get('/schedule.pdf', (req, res) => {
  const database = db.load();
  const meetId = req.query.meetId;
  const meet = database.meets[meetId];

  const eventIds = new Set(
    Object.values(database.events)
      .filter((e) => !meetId || e.meetId === meetId)
      .map((e) => e.id)
  );

  // Combine races and breaks, sorted by day then sortKey (race number for races, float for breaks)
  const raceItems = Object.values(database.races)
    .filter((r) => eventIds.has(r.eventId))
    .map((r) => ({
      type: 'race',
      sortKey: r.raceNumber,
      day: r.day || (database.events[r.eventId] && database.events[r.eventId].day) || 1,
      ...enrichRace(database, { ...r, event: database.events[r.eventId] }),
    }));

  const breakItems = Object.values(database.breaks)
    .filter((b) => b.meetId === meetId)
    .map((b) => ({
      type: 'break',
      sortKey: b.sortKey,
      day: b.day || 1,
      label: b.label,
      scheduledLabel: b.scheduledLabel,
      raceNumber: null,
    }));

  const races = [...raceItems, ...breakItems]
    .sort((a, b) => a.day !== b.day ? a.day - b.day : a.sortKey - b.sortKey);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="schedule-planning.pdf"');
  res.setHeader('Cache-Control', 'no-store');

  const doc = new PDFDocument({ margin: 36, size: 'A4' });
  doc.pipe(res);

  const meetName = meet ? meet.name : 'Race Schedule';
  doc.fontSize(16).font('Helvetica-Bold').text(meetName, { align: 'center' });
  doc.fontSize(9).font('Helvetica').fillColor('#888')
    .text(`Planning sheet — ${new Date().toLocaleString()}`, { align: 'center' });
  doc.moveDown(0.8);
  doc.fillColor('#000');

  if (races.length === 0) {
    doc.fontSize(11).fillColor('#666').text('No races generated yet.');
    doc.end();
    return;
  }

  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const pageWidth = right - left;

  const cNum   = left;            const wNum   = 30;
  const cDay   = cNum + wNum + 4; const wDay   = 28;
  const cEvent = cDay + wDay + 6; const wEvent = pageWidth - wNum - wDay - 100;
  const cTime  = cEvent + wEvent + 6; const wTime = 54;
  const rowH = 18;

  function columnHeaders() {
    const y = doc.y;
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#888');
    doc.text('#',     cNum,   y, { width: wNum });
    doc.text('DAY',   cDay,   y, { width: wDay });
    doc.text('EVENT', cEvent, y, { width: wEvent });
    doc.text('START', cTime,  y, { width: wTime, align: 'center' });
    doc.moveDown(0.4);
    doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor('#ccc').lineWidth(0.5).stroke();
    doc.moveDown(0.3);
    doc.fillColor('#000');
  }

  function dayHeader(day) {
    if (doc.y > doc.page.height - doc.page.margins.bottom - rowH * 3) {
      doc.addPage();
    } else {
      doc.moveDown(0.5);
    }
    const y = doc.y;
    doc.rect(left, y, pageWidth, rowH).fill('#1a3a5c');
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#fff');
    doc.text(`DAY ${day}`, left + 6, y + 4, { width: pageWidth });
    doc.fillColor('#000');
    doc.y = y + rowH + 2;
  }

  columnHeaders();

  let currentDay = null;
  let rowIndex = 0;

  races.forEach((race, idx) => {
    // Day separator
    if (race.day !== currentDay) {
      currentDay = race.day;
      dayHeader(currentDay);
      rowIndex = 0;
    }

    if (doc.y > doc.page.height - doc.page.margins.bottom - rowH) {
      doc.addPage();
      columnHeaders();
      rowIndex = 0;
    }

    const y = doc.y;

    // Break row — orange tint, italic label, vertically centred
    if (race.type === 'break') {
      doc.rect(left, y - 1, pageWidth, rowH).fill('#FFF3E0');
      const textY = y + (rowH - 9) / 2 - 1; // vertically centre 9pt text in rowH
      doc.fontSize(9).font('Helvetica-Oblique').fillColor('#8A5A12');
      doc.text(`— ${race.label}${race.durationMinutes ? ' (' + race.durationMinutes + ' min)' : ''} —`, cEvent, textY, { width: wEvent });
      doc.text(`D${race.day}`, cDay, textY, { width: wDay });
      if (race.scheduledLabel) {
        doc.font('Helvetica-Bold');
        doc.text(race.scheduledLabel, cTime, textY, { width: wTime, align: 'center' });
      } else {
        doc.rect(cTime, y + 2, wTime, rowH - 5).strokeColor('#F3C98B').lineWidth(0.5).stroke();
      }
      doc.fillColor('#000');
      doc.y = y + rowH;
      rowIndex++;
      return;
    }

    if (rowIndex % 2 === 0) {
      doc.rect(left, y - 1, pageWidth, rowH).fill('#F7F8FA');
      doc.fillColor('#000');
    }

    const desc = raceDescription(race);
    const timeLabel = race.scheduledLabel || '';
    const textY = y + (rowH - 9) / 2 - 1; // vertically centre 9pt text in rowH

    doc.fontSize(9).font('Helvetica-Bold').fillColor('#1a3a5c');
    doc.text(String(race.raceNumber), cNum, textY, { width: wNum });
    doc.font('Helvetica').fillColor('#666');
    doc.text(`D${race.day}`, cDay, textY, { width: wDay });
    doc.fillColor('#000');
    doc.text(desc, cEvent, textY, { width: wEvent, lineBreak: false });

    if (timeLabel) {
      doc.font('Helvetica-Bold').fillColor('#1a3a5c');
      doc.text(timeLabel, cTime, textY, { width: wTime, align: 'center' });
    } else {
      doc.rect(cTime, y + 2, wTime, rowH - 5).strokeColor('#bbb').lineWidth(0.5).stroke();
    }

    doc.fillColor('#000');
    doc.y = y + rowH;
    rowIndex++;

    // End of day marker when the next item is a different day (or last item)
    const nextRace = races[idx + 1];
    if (!nextRace || (nextRace.day || 1) !== (race.day || 1)) {
      if (doc.y > doc.page.height - doc.page.margins.bottom - rowH * 2) {
        doc.addPage();
      }
      const ey = doc.y + 2;
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#aaa');
      doc.text(`— END OF DAY ${race.day || 1} —`, left, ey, { width: pageWidth, align: 'center' });
      doc.moveTo(left, doc.y + 2).lineTo(right, doc.y + 2).strokeColor('#ccc').lineWidth(0.5).stroke();
      doc.y += 10;
      doc.fillColor('#000');
    }
  });

  doc.end();
});

module.exports = router;
