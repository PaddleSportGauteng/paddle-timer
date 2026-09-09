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
  const colNum = left;
  const colNumW = 34;
  const colLeave = right - 60;
  const colLeaveW = 60;
  const colTime = colLeave - 62;
  const colTimeW = 60;
  const colDesc = colNum + colNumW;
  const colDescW = colTime - colDesc - 10;
  const rowHeight = 20;

  function drawHeader() {
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#666');
    const y = doc.y;
    doc.text('#', colNum, y, { width: colNumW });
    doc.text('Event', colDesc, y, { width: colDescW });
    doc.text('Time', colTime, y, { width: colTimeW, align: 'right' });
    doc.text('Leave', colLeave, y, { width: colLeaveW, align: 'right' });
    doc.moveDown(0.6);
    doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor('#D8DCE0').stroke();
    doc.moveDown(0.4);
    doc.fillColor('#000');
  }

  drawHeader();

  races.forEach((race) => {
    if (doc.y > doc.page.height - doc.page.margins.bottom - rowHeight) {
      doc.addPage();
      drawHeader();
    }
    const y = doc.y;
    const desc = raceDescription(race);
    const time = race.scheduledLabel || 'TBC';
    const leave = leaveForStart(race.scheduledLabel, leadMinutes) || '—';
    const descColor = race.placeholder ? '#999' : (race.overridden ? '#C93B3B' : '#000');

    doc.fontSize(10).font('Helvetica-Bold').fillColor('#1a3a5c');
    doc.text(String(race.raceNumber), colNum, y, { width: colNumW });
    doc.font('Helvetica').fillColor(descColor);
    doc.text(desc, colDesc, y, { width: colDescW });
    const descHeight = doc.heightOfString(desc, { width: colDescW });
    doc.font('Helvetica-Bold').fillColor('#1a3a5c');
    doc.text(time, colTime, y, { width: colTimeW, align: 'right' });
    doc.font('Helvetica').fillColor('#666');
    doc.text(leave, colLeave, y, { width: colLeaveW, align: 'right' });

    doc.y = y + Math.max(descHeight, doc.currentLineHeight()) + 6;
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

  races.forEach((race) => {
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
  });

  doc.end();
});

module.exports = router;
