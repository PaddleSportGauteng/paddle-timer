const express = require('express');
const ExcelJS = require('exceljs');
const db = require('../db');
const { enrichRace, sortByScheduleThenNumber, getClubCode } = require('../present');
const rules = require('../rules');

const router = express.Router();

const PHASE_LABELS = { heat: 'Heat', semi: 'Semifinal', final: 'Final', finalB: 'Final B', finalC: 'Final C' };

function raceHeading(race) {
  const eventLabel = race.combinedLabel || (race.event ? race.event.label : '');
  let phaseText = PHASE_LABELS[race.phase] || race.phase;
  if (race.phase === 'heat' || race.phase === 'semi') phaseText += ` ${race.heatNumber}`;
  let heading = `Event ${race.raceNumber}: ${eventLabel} ${phaseText}`;
  if (race.isMassStart) heading += ` (mass start, ${race.totalLaps} laps)`;
  if (race.overridden) heading += ' [OVERRIDDEN]';
  if (race.placeholder) heading += ' [TBC — pending qualifiers]';
  return heading;
}

router.get('/draws.xlsx', async (req, res) => {
  const database = db.load();
  const meetId = req.query.meetId;
  const dayFilter = req.query.day ? Number(req.query.day) : null;
  const meet = database.meets[meetId];
  const meetLanes = (meet && meet.lanes) || rules.DEFAULT_LANES;

  const eventIds = new Set(
    Object.values(database.events)
      .filter((e) => (!meetId || e.meetId === meetId) && (!dayFilter || (e.day || 1) === dayFilter))
      .map((e) => e.id)
  );
  const races = sortByScheduleThenNumber(
    Object.values(database.races).filter((r) => eventIds.has(r.eventId))
  ).map((r) => enrichRace(database, { ...r, event: database.events[r.eventId] }));

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(dayFilter ? `Draws Day ${dayFilter}` : 'Draws');
  sheet.columns = [
    { width: 8 }, { width: 8 }, { width: 18 }, { width: 20 }, { width: 10 }, { width: 12 },
  ];

  const boldFont = { bold: true };
  const headerFont = { bold: true, color: { argb: 'FF1A3A5C' } };
  const grayFont = { italic: true, color: { argb: 'FF999999' } };

  let rowIdx = 1;
  function writeRow(values, opts) {
    const row = sheet.getRow(rowIdx);
    values.forEach((v, i) => { row.getCell(i + 1).value = v; });
    if (opts && opts.font) row.font = opts.font;
    rowIdx += 1;
    return row;
  }

  // Prominent timestamp — this file is a snapshot the instant it was
  // downloaded, not a live view. If it ever looks different from the
  // Race Program screen, check this date/time first: the screen is
  // always current, this file is only as current as when you clicked
  // download. Re-download after any change (scratch, fix entry, etc.)
  // rather than trusting an older copy.
  writeRow([`Generated: ${new Date().toLocaleString()} — re-download after any change, this is a snapshot, not live`], { font: grayFont });
  rowIdx += 1;

  races.forEach((race) => {
    const headingRow = writeRow([raceHeading(race)], { font: headerFont });
    sheet.mergeCells(headingRow.number, 1, headingRow.number, 5);
    headingRow.getCell(6).value = race.scheduledLabel || 'TBC';
    headingRow.getCell(6).font = boldFont;

    const laneEntries = Object.entries(race.laneEntries).sort((a, b) => Number(a[0]) - Number(b[0]));

    // Detect K2/C2 — any occupied lane with 2 athletes
    const isCrewRace = laneEntries.some(([, info]) => {
      if (!info) return false;
      const entry = database.entries[info.entryId];
      return entry && entry.athleteIds.length > 1;
    });

    if (isCrewRace) {
      writeRow([
        'Pos', race.isMassStart ? 'Slide' : 'Lane',
        'Name (Paddler 1)', 'Surname (Paddler 1)', 'Club (Paddler 1)', 'Age', 'Sex', 'PSA ID (P1)',
        'Name (Paddler 2)', 'Surname (Paddler 2)', 'Club (Paddler 2)', 'Age', 'Sex', 'PSA ID (P2)',
      ], { font: boldFont });
    } else {
      writeRow(['Pos', race.isMassStart ? 'Slide' : 'Lane', 'Name', 'Surname', 'Club', 'Age', 'Sex', 'PSA ID'], { font: boldFont });
    }

    const rowsToShow = race.isMassStart
      ? laneEntries.filter(([, info]) => info)
      : (() => {
          const byLane = {};
          laneEntries.forEach(([lane, info]) => { byLane[lane] = info; });
          const all = [];
          for (let i = 1; i <= meetLanes; i++) all.push([String(i), byLane[String(i)] || null]);
          return all;
        })();

    rowsToShow.forEach(([laneOrSlide, info]) => {
      if (!info) {
        if (isCrewRace) {
          writeRow(['-', Number(laneOrSlide), '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-']);
        } else {
          writeRow(['-', Number(laneOrSlide), '-', '-', '-', '-', '-', '-']);
        }
        return;
      }

      const result = race.results[info.entryId];
      const pos = result && result.status === 'OK' ? result.position : '-';
      const entry = database.entries[info.entryId];
      const athleteIds = entry && entry.athleteIds.length ? entry.athleteIds : [null];
      const ageCategory = info.ageCategory || '';
      const gRaw = info.gender || '';
      const gender = gRaw.toLowerCase().startsWith('f') ? 'F' : gRaw.toLowerCase().startsWith('m') ? 'M' : gRaw;

      if (isCrewRace) {
        const paddlerData = [0, 1].map(i => {
          const athleteId = athleteIds[i] || null;
          const athlete = athleteId ? database.athletes[athleteId] : null;
          const fullName = athlete
            ? `${athlete.firstName} ${athlete.surname || ''}`.trim()
            : (info.names[i] || '-');
          const firstName = fullName ? fullName.split(' ')[0] : '-';
          const surname = fullName ? fullName.split(' ').slice(1).join(' ') || '-' : '-';
          const clubCode = athlete && athlete.club ? getClubCode(database, athlete.club) : (i === 0 ? info.clubCode || '-' : '-');
          const psaId = athlete ? athlete.psaId || '-' : '-';
          return [firstName, surname, clubCode, ageCategory, gender, psaId];
        });
        writeRow([pos, Number(laneOrSlide), ...paddlerData[0], ...paddlerData[1]]);
      } else {
        const athleteId = athleteIds[0] || null;
        const athlete = athleteId ? database.athletes[athleteId] : null;
        const fullName = athlete
          ? `${athlete.firstName} ${athlete.surname || ''}`.trim()
          : (info.names[0] || '');
        const firstName = fullName ? fullName.split(' ')[0] : '';
        const surname = fullName ? fullName.split(' ').slice(1).join(' ') : '';
        const clubCode = athlete && athlete.club ? getClubCode(database, athlete.club) : (info.clubCode || '');
        const psaId = athlete ? athlete.psaId || '-' : '-';
        writeRow([pos, Number(laneOrSlide), firstName, surname, clubCode, ageCategory, gender, psaId]);
      }
    });

    rowIdx += 1;
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="draws${dayFilter ? '-day' + dayFilter : ''}.xlsx"`);
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  await workbook.xlsx.write(res);
  res.end();
});

module.exports = router;
