// Results export — Excel and PDF. Both are built from the SAME
// buildResultBlocks() the Results page uses, so what you download is
// exactly what's on screen: same ranking, same medal flags, same
// combined-start splitting, same PSA 9.4 medal minimums.
//
// Column order matches every screen: POS · NAME · AGE · CLUB · M/F ·
// UNION · PSA # · TIME · WEIGHT.

const express = require('express');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const db = require('../db');
const { buildResultBlocks } = require('./results');

const router = express.Router();

const NAVY = '0B2540';
const GREEN = '1E8E5A';
const RED = 'C93B3B';
const GRAY = '6B7480';
const LINE = 'D8DCE0';

function fmtMs(ms) {
  if (ms == null) return '';
  const cs = Math.floor(ms / 10) % 100, s = Math.floor(ms / 1000) % 60, m = Math.floor(ms / 60000);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}
const gl = (g) => g ? (g.toLowerCase().startsWith('f') ? 'F' : g.toLowerCase().startsWith('m') ? 'M' : g) : '';
function medalFor(b, place) {
  if (!b.medalEligibility) return '';
  if (place === 1 && b.medalEligibility.gold) return 'GOLD';
  if (place === 2 && b.medalEligibility.silver) return 'SILVER';
  if (place === 3 && b.medalEligibility.bronze) return 'BRONZE';
  return '';
}
function blockTitle(b) {
  return `R${b.raceNumber} — ${b.label} — ${b.phaseLabel}`;
}
function loadBlocks(req) {
  const database = db.load();
  const meetId = req.query.meetId;
  const dayFilter = req.query.day ? Number(req.query.day) : null;
  const meet = database.meets[meetId];
  const blocks = buildResultBlocks(database, meetId, dayFilter);
  return { meet, blocks, dayFilter };
}

// ── Excel ─────────────────────────────────────────────────────────
router.get('/results.xlsx', async (req, res) => {
  const { meet, blocks, dayFilter } = loadBlocks(req);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(dayFilter ? `Results Day ${dayFilter}` : 'Results');
  ws.columns = [
    { width: 7 },  // POS
    { width: 8 },  // MEDAL
    { width: 30 }, // NAME
    { width: 8 },  // AGE
    { width: 9 },  // CLUB
    { width: 6 },  // M/F
    { width: 9 },  // UNION
    { width: 10 }, // PSA #
    { width: 11 }, // TIME
    { width: 10 }, // WEIGHT
    { width: 14 }, // STATUS / NOTE
  ];
  const arial = (extra) => ({ name: 'Arial', size: 10, ...extra });

  let r = 1;
  const put = (values, font, fill) => {
    const row = ws.getRow(r++);
    values.forEach((v, i) => { row.getCell(i + 1).value = v; });
    row.eachCell((cell) => { cell.font = arial(font || {}); if (fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + fill } }; });
    return row;
  };

  put([meet ? meet.name : 'Results'], { bold: true, size: 14, color: { argb: 'FF' + NAVY } });
  put([`PaddleSport Gauteng — Results${dayFilter ? ` — Day ${dayFilter}` : ''}`], { color: { argb: 'FF' + GRAY } });
  put([`Generated ${new Date().toLocaleString('en-GB')} — snapshot, not live. Re-download after any change.`], { italic: true, color: { argb: 'FF999999' } });
  r++;

  if (blocks.length === 0) {
    put(['No finished races yet.'], { color: { argb: 'FF' + GRAY } });
  }

  blocks.forEach((b) => {
    put([blockTitle(b) + (b.isFinal ? (b.resultsConfirmed ? '   [OFFICIAL]' : '   [PROVISIONAL]') : '')], { bold: true, size: 11, color: { argb: 'FF' + NAVY } });
    if (b.combinedWith) put([`Combined start with: ${b.combinedWith} — results split back to this category (PSA 1.2.1/1.2.2)`], { italic: true, color: { argb: 'FF' + GRAY } });
    if (b.medalEligibility && b.medalEligibility.flag) put([b.medalEligibility.flag], { italic: true, color: { argb: 'FF' + RED } });

    const hdr = put(['POS', 'MEDAL', 'NAME', 'AGE', 'CLUB', 'M/F', 'UNION', 'PSA #', 'TIME', 'WEIGHT', 'STATUS'], { bold: true, color: { argb: 'FFFFFFFF' } }, NAVY);
    hdr.eachCell((c) => { c.alignment = { horizontal: 'center' }; });

    b.ranked.forEach((x, i) => {
      const row = put([
        x.place + (x.deadHeat ? '=' : ''),
        medalFor(b, x.place),
        (x.names || []).join(' / ').toUpperCase(),
        x.ageCategory || '', x.clubCode || '', gl(x.gender), x.union || '', (x.psaIds || [])[0] || '',
        fmtMs(x.timeMs),
        x.weighIn ? `${x.weighIn.weightKg} kg` : '',
        x.deadHeat ? 'Dead heat' : '',
      ], {}, i % 2 ? 'F3F6FA' : null);
      row.getCell(3).font = arial({ bold: true });
      row.getCell(9).font = arial({ bold: true, color: { argb: 'FF' + GREEN } });
      [1, 2, 4, 5, 6, 7, 8, 9, 10].forEach((ci) => { row.getCell(ci).alignment = { horizontal: 'center' }; });
    });
    b.others.forEach((o, i) => {
      const row = put([
        '—', '',
        (o.names || []).join(' / ').toUpperCase(),
        o.ageCategory || '', o.clubCode || '', gl(o.gender), o.union || '', (o.psaIds || [])[0] || '',
        o.status,
        o.weighIn ? `${o.weighIn.weightKg} kg` : '',
        o.dqReason || '',
      ], {}, (b.ranked.length + i) % 2 ? 'F3F6FA' : null);
      row.getCell(3).font = arial({ bold: true });
      row.getCell(9).font = arial({ bold: true, color: { argb: 'FF' + RED } });
      [1, 4, 5, 6, 7, 8, 9, 10].forEach((ci) => { row.getCell(ci).alignment = { horizontal: 'center' }; });
    });
    r++;
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="results${dayFilter ? '-day' + dayFilter : ''}.xlsx"`);
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  await wb.xlsx.write(res);
  res.end();
});

// ── PDF ───────────────────────────────────────────────────────────
router.get('/results.pdf', (req, res) => {
  const { meet, blocks, dayFilter } = loadBlocks(req);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="results${dayFilter ? '-day' + dayFilter : ''}.pdf"`);
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');

  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  doc.pipe(res);

  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const pageW = right - left;

  // Header
  doc.fontSize(18).font('Helvetica-Bold').fillColor('#' + NAVY).text(meet ? meet.name : 'Results', { align: 'center' });
  doc.fontSize(11).font('Helvetica').fillColor('#' + GRAY).text(`PaddleSport Gauteng — Results${dayFilter ? ` — Day ${dayFilter}` : ''}`, { align: 'center' });
  doc.fontSize(8.5).text(`Generated ${new Date().toLocaleString('en-GB')} — snapshot, not live. Re-download after any change.`, { align: 'center' });
  doc.moveDown(0.8);
  doc.fillColor('#000');

  if (blocks.length === 0) {
    doc.fontSize(11).fillColor('#' + GRAY).text('No finished races yet.');
    doc.end();
    return;
  }

  // Columns: POS · NAME · AGE · CLUB · M/F · UNION · PSA # · TIME · WEIGHT
  const cols = [
    { label: 'POS',    w: 34, align: 'left' },
    { label: 'NAME',   w: 0,  align: 'left' },
    { label: 'AGE',    w: 40, align: 'left' },
    { label: 'CLUB',   w: 46, align: 'left' },
    { label: 'M/F',    w: 28, align: 'left' },
    { label: 'UNION',  w: 44, align: 'left' },
    { label: 'PSA #',  w: 48, align: 'left' },
    { label: 'TIME',   w: 58, align: 'right' },
    { label: 'WEIGHT', w: 48, align: 'right' },
  ];
  cols[1].w = pageW - cols.reduce((s, c) => s + c.w, 0);
  let x = left; cols.forEach((c) => { c.x = x; x += c.w; });
  const rowH = 14;
  const ensure = (h) => { if (doc.y + h > doc.page.height - doc.page.margins.bottom) doc.addPage(); };
  const cell = (i, text, y, font, color) => {
    doc.font(font).fillColor(color);
    doc.text(text, cols[i].x + 3, y, { width: cols[i].w - 6, align: cols[i].align, lineBreak: false, ellipsis: true });
  };

  blocks.forEach((b) => {
    const n = b.ranked.length + b.others.length;
    ensure(Math.min(30 + 14 + n * rowH, 140));

    // Title
    const y0 = doc.y;
    doc.fontSize(10.5).font('Helvetica-Bold').fillColor('#' + NAVY);
    doc.text(blockTitle(b), left, y0, { width: pageW - 110, lineBreak: false });
    if (b.isFinal) {
      doc.font('Helvetica').fillColor(b.resultsConfirmed ? '#' + GREEN : '#E2662D');
      doc.text(b.resultsConfirmed ? 'OFFICIAL' : 'PROVISIONAL', right - 100, y0, { width: 100, align: 'right', lineBreak: false });
    }
    doc.y = y0 + 14;
    if (b.combinedWith) { doc.fontSize(8).font('Helvetica-Oblique').fillColor('#' + GRAY).text(`Combined start with ${b.combinedWith} — split back to this category (PSA 1.2.1/1.2.2)`, left, doc.y, { width: pageW }); doc.y += 2; }
    if (b.medalEligibility && b.medalEligibility.flag) { doc.fontSize(8).font('Helvetica-Oblique').fillColor('#' + RED).text(b.medalEligibility.flag, left, doc.y, { width: pageW }); doc.y += 2; }

    // Column header
    const hy = doc.y;
    doc.fontSize(7.5);
    cols.forEach((c, i) => cell(i, c.label, hy, 'Helvetica-Bold', '#' + GRAY));
    doc.y = hy + 11;
    doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor('#' + LINE).lineWidth(1).stroke();
    doc.y += 2;

    doc.fontSize(8.5);
    const rows = [...b.ranked.map((r) => ({ r, bad: false })), ...b.others.map((r) => ({ r, bad: true }))];
    rows.forEach(({ r, bad }, i) => {
      ensure(rowH);
      const ry = doc.y;
      if (i % 2 === 1) { doc.rect(left, ry - 2, pageW, rowH).fill('#F3F6FA'); }
      const medal = bad ? '' : medalFor(b, r.place);
      const pos = bad ? '—' : String(r.place) + (r.deadHeat ? '=' : '') + (medal ? ' ' + medal[0] : '');
      cell(0, pos, ry, 'Helvetica-Bold', medal ? '#E2662D' : '#' + NAVY);
      cell(1, (r.names || []).join(' / ').toUpperCase(), ry, 'Helvetica-Bold', '#000');
      cell(2, r.ageCategory || '', ry, 'Helvetica', '#' + GRAY);
      cell(3, r.clubCode || '', ry, 'Helvetica', '#' + GRAY);
      cell(4, gl(r.gender), ry, 'Helvetica', '#' + GRAY);
      cell(5, r.union || '', ry, 'Helvetica', '#' + GRAY);
      cell(6, (r.psaIds || [])[0] || '', ry, 'Helvetica', '#' + GRAY);
      cell(7, bad ? r.status : fmtMs(r.timeMs), ry, 'Helvetica-Bold', bad ? '#' + RED : '#' + GREEN);
      cell(8, r.weighIn ? `${r.weighIn.weightKg} kg` : '', ry, 'Helvetica', '#' + GRAY);
      doc.y = ry + rowH;
    });
    doc.y += 10;
  });

  // Legend
  doc.fontSize(7.5).font('Helvetica').fillColor('#' + GRAY)
    .text('POS: G = Gold, S = Silver, B = Bronze (PSA 9.4 minimums apply). = marks a dead heat (ICF 10.6.3).', left, doc.y, { width: pageW });

  doc.end();
});


// ── Prize-giving sheet ────────────────────────────────────────────
// Only medal winners from finals, grouped the way they're read out:
// distance → boat class → age group → gender. Within each group:
// Gold, Silver, Bronze. Honours PSA 9.4 minimums (a 4-boat race lists
// gold only). Skips any category with no medals.

const AGE_ORDER = ['Guppy','U8','U10','U12','U14','U16','U18','U21','U23','Senior','Open','SubVet','Sub-Vet','Vet','Master','Grand Master','Great Grand Master'];
function ageRank(a){ const i = AGE_ORDER.findIndex(x => (a||'').toLowerCase().startsWith(x.toLowerCase())); return i === -1 ? 99 : i; }
function distRank(d){ const n = parseInt(String(d||'').replace(/\D/g,''), 10); return isNaN(n) ? 99999 : n; }
function genderRank(g){ const s=(g||'').toLowerCase(); return s.startsWith('f')?0 : s.startsWith('m')?1 : 2; }
function genderLabel(g){ const s=(g||'').toLowerCase(); return s.startsWith('f')?'Female' : s.startsWith('m')?'Male' : (g||''); }

function buildPrizeGroups(blocks) {
  const groups = [];
  blocks.filter(b => b.isFinal && b.medalEligibility).forEach(b => {
    const winners = [];
    b.ranked.forEach(r => {
      const m = medalFor(b, r.place);
      if (m) winners.push({ medal: m, ...r });
    });
    if (!winners.length) return;
    // Dead heats: two golds means both listed as GOLD; drop silver if ICF/PSA
    // position skipping means it doesn't exist.
    groups.push({
      title: `${b.distance} ${b.boatClass} ${b.ageCategory} ${genderLabel(b.gender)}`.replace(/\s+/g,' ').trim(),
      distance: b.distance, boatClass: b.boatClass, ageCategory: b.ageCategory, gender: b.gender,
      raceNumber: b.raceNumber, official: b.resultsConfirmed, winners,
    });
  });
  groups.sort((a, b) =>
    distRank(a.distance) - distRank(b.distance) ||
    String(a.boatClass).localeCompare(String(b.boatClass)) ||
    ageRank(a.ageCategory) - ageRank(b.ageCategory) ||
    genderRank(a.gender) - genderRank(b.gender));
  return groups;
}

router.get('/prizes.json', (req, res) => {
  const { blocks } = loadBlocks(req);
  res.json(buildPrizeGroups(blocks));
});

router.get('/prizes.xlsx', async (req, res) => {
  const { meet, blocks, dayFilter } = loadBlocks(req);
  const groups = buildPrizeGroups(blocks);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Prize Giving');
  ws.columns = [{ width: 9 }, { width: 30 }, { width: 9 }, { width: 8 }, { width: 8 }, { width: 11 }, { width: 11 }];
  const arial = (extra) => ({ name: 'Arial', size: 10, ...extra });
  let r = 1;
  const put = (values, font, fill) => {
    const row = ws.getRow(r++);
    values.forEach((v, i) => { row.getCell(i + 1).value = v; });
    row.eachCell((cell) => { cell.font = arial(font || {}); if (fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + fill } }; });
    return row;
  };
  put([meet ? meet.name : 'Prize Giving'], { bold: true, size: 14, color: { argb: 'FF' + NAVY } });
  put([`PaddleSport Gauteng — Prize Giving${dayFilter ? ` — Day ${dayFilter}` : ''}`], { color: { argb: 'FF' + GRAY } });
  put([`Generated ${new Date().toLocaleString('en-GB')} — snapshot. Provisional results marked *.`], { italic: true, color: { argb: 'FF999999' } });
  r++;
  if (!groups.length) put(['No medals awarded yet.'], { color: { argb: 'FF' + GRAY } });
  groups.forEach(g => {
    put([g.title + (g.official ? '' : '  *PROVISIONAL')], { bold: true, size: 11, color: { argb: 'FF' + NAVY } });
    const hdr = put(['MEDAL', 'NAME', 'CLUB', 'AGE', 'M/F', 'PSA #', 'TIME'], { bold: true, color: { argb: 'FFFFFFFF' } }, NAVY);
    hdr.eachCell(c => { c.alignment = { horizontal: 'center' }; });
    g.winners.forEach((w, i) => {
      const row = put([w.medal, (w.names||[]).join(' / ').toUpperCase(), w.clubCode||'', w.ageCategory||'', gl(w.gender), (w.psaIds||[])[0]||'', fmtMs(w.timeMs)], {}, i % 2 ? 'F3F6FA' : null);
      const col = w.medal==='GOLD' ? 'C9A227' : w.medal==='SILVER' ? '8A8A8A' : 'A0522D';
      row.getCell(1).font = arial({ bold: true, color: { argb: 'FF' + col } });
      row.getCell(2).font = arial({ bold: true });
      [1,3,4,5,6,7].forEach(ci => { row.getCell(ci).alignment = { horizontal: 'center' }; });
    });
    r++;
  });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="prize-giving${dayFilter ? '-day' + dayFilter : ''}.xlsx"`);
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  await wb.xlsx.write(res);
  res.end();
});

router.get('/prizes.pdf', (req, res) => {
  const { meet, blocks, dayFilter } = loadBlocks(req);
  const groups = buildPrizeGroups(blocks);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="prize-giving${dayFilter ? '-day' + dayFilter : ''}.pdf"`);
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  doc.pipe(res);
  const left = doc.page.margins.left, right = doc.page.width - doc.page.margins.right, pageW = right - left;
  doc.fontSize(18).font('Helvetica-Bold').fillColor('#' + NAVY).text(meet ? meet.name : 'Prize Giving', { align: 'center' });
  doc.fontSize(11).font('Helvetica').fillColor('#' + GRAY).text(`PaddleSport Gauteng — Prize Giving${dayFilter ? ` — Day ${dayFilter}` : ''}`, { align: 'center' });
  doc.fontSize(8.5).text(`Generated ${new Date().toLocaleString('en-GB')} — provisional results marked *`, { align: 'center' });
  doc.moveDown(1);
  if (!groups.length) { doc.fontSize(11).fillColor('#' + GRAY).text('No medals awarded yet.'); doc.end(); return; }
  const medalColour = { GOLD: '#C9A227', SILVER: '#8A8A8A', BRONZE: '#A0522D' };
  const rowH = 18;
  groups.forEach(g => {
    const need = 22 + g.winners.length * rowH + 10;
    if (doc.y + need > doc.page.height - doc.page.margins.bottom) doc.addPage();
    doc.rect(left, doc.y, pageW, 18).fill('#' + NAVY);
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#fff').text(g.title + (g.official ? '' : '   *PROVISIONAL'), left + 8, doc.y + 4, { lineBreak: false });
    doc.y += 22;
    g.winners.forEach((w, i) => {
      const y = doc.y;
      if (i % 2 === 1) doc.rect(left, y - 3, pageW, rowH).fill('#F3F6FA');
      doc.fontSize(10).font('Helvetica-Bold').fillColor(medalColour[w.medal] || '#000');
      doc.text(w.medal, left + 8, y, { width: 60, lineBreak: false });
      doc.fillColor('#000').text((w.names||[]).join(' / ').toUpperCase(), left + 72, y, { width: pageW - 72 - 200, lineBreak: false, ellipsis: true });
      doc.font('Helvetica').fillColor('#' + GRAY);
      doc.text(w.clubCode || '', right - 200, y, { width: 60, lineBreak: false });
      doc.text((w.psaIds||[])[0] || '', right - 136, y, { width: 60, lineBreak: false });
      doc.font('Helvetica-Bold').fillColor('#' + GREEN).text(fmtMs(w.timeMs), right - 70, y, { width: 70, align: 'right', lineBreak: false });
      doc.y = y + rowH;
    });
    doc.y += 12;
  });
  doc.end();
});

module.exports = router;
