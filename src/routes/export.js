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

module.exports = router;
