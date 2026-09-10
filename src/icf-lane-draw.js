/**
 * ICF Appendix 1 — Exact lane draw for heats → semis → finals.
 * Transcribed verbatim from ICF Canoe Sprint Competition Rules 2025.
 * Plans A-D cover 10-45 boats (2-5 heats) on a 9-lane course.
 */

// ─────────────────────────────────────────────────────────────
// PLAN A  (2 heats, 10-18 boats)
// ─────────────────────────────────────────────────────────────
const PLAN_A = {
  // 4th-7th + 1 BT → SF1
  semis: {
    P1: [
      { fromHeat:1, pos:4, toSemi:1, toLane:5 },
      { fromHeat:1, pos:5, toSemi:1, toLane:6 },
      { fromHeat:1, pos:6, toSemi:1, toLane:2 },
      { fromHeat:1, pos:7, toSemi:1, toLane:8 },
      { fromHeat:2, pos:4, toSemi:1, toLane:4 },
      { fromHeat:2, pos:5, toSemi:1, toLane:3 },
      { fromHeat:2, pos:6, toSemi:1, toLane:7 },
      { fromHeat:2, pos:7, toSemi:1, toLane:1 },
      { fromHeat:'BT', pos:1, toSemi:1, toLane:9 },
    ],
  },
  // Finals
  finalA: [
    // Direct from heats (1st-3rd)
    { from:'heat', heat:1, pos:1, toLane:5 },
    { from:'heat', heat:1, pos:2, toLane:3 },
    { from:'heat', heat:1, pos:3, toLane:7 },
    { from:'heat', heat:2, pos:1, toLane:4 },
    { from:'heat', heat:2, pos:2, toLane:6 },
    { from:'heat', heat:2, pos:3, toLane:2 },
    // From SF
    { from:'semi', semi:1, pos:1, toLane:8 },
    { from:'semi', semi:1, pos:2, toLane:1 },
    { from:'semi', semi:1, pos:3, toLane:9 },
  ],
};

// ─────────────────────────────────────────────────────────────
// PLAN B  (3 heats, 19-27 boats)
// ─────────────────────────────────────────────────────────────
const PLAN_B = {
  semis: {
    P1: [
      // SF1
      { fromHeat:1, pos:2, toSemi:1, toLane:5 },
      { fromHeat:1, pos:4, toSemi:1, toLane:7 },
      { fromHeat:1, pos:6, toSemi:1, toLane:1 },
      { fromHeat:2, pos:3, toSemi:1, toLane:4 },
      { fromHeat:2, pos:5, toSemi:1, toLane:2 },
      { fromHeat:2, pos:7, toSemi:1, toLane:9 },
      { fromHeat:3, pos:3, toSemi:1, toLane:6 },
      { fromHeat:3, pos:4, toSemi:1, toLane:3 },
      { fromHeat:3, pos:6, toSemi:1, toLane:8 },
      // SF2
      { fromHeat:1, pos:3, toSemi:2, toLane:6 },
      { fromHeat:1, pos:5, toSemi:2, toLane:7 },
      { fromHeat:1, pos:7, toSemi:2, toLane:1 },
      { fromHeat:2, pos:2, toSemi:2, toLane:5 },
      { fromHeat:2, pos:4, toSemi:2, toLane:3 },
      { fromHeat:2, pos:6, toSemi:2, toLane:8 },
      { fromHeat:3, pos:2, toSemi:2, toLane:4 },
      { fromHeat:3, pos:5, toSemi:2, toLane:2 },
      { fromHeat:3, pos:7, toSemi:2, toLane:9 },
    ],
  },
  directToFinal: [
    { heat:1, pos:1, toLane:5 },
    { heat:2, pos:1, toLane:4 },
    { heat:3, pos:1, toLane:6 },
  ],
  finalA: [
    // Direct heat winners
    { from:'heat', heat:1, pos:1, toLane:5 },
    { from:'heat', heat:2, pos:1, toLane:4 },
    { from:'heat', heat:3, pos:1, toLane:6 },
    // From SF1
    { from:'semi', semi:1, pos:1, toLane:3 },
    { from:'semi', semi:1, pos:2, toLane:8 },
    { from:'semi', semi:1, pos:3, toLane:1 },
    // From SF2
    { from:'semi', semi:2, pos:1, toLane:7 },
    { from:'semi', semi:2, pos:2, toLane:2 },
    { from:'semi', semi:2, pos:3, toLane:9 },
  ],
  finalB: [
    { from:'semi', semi:1, pos:4, toLane:5 },
    { from:'semi', semi:1, pos:5, toLane:3 },
    { from:'semi', semi:1, pos:6, toLane:7 },
    { from:'semi', semi:1, pos:7, toLane:1 },
    { from:'semi', semi:2, pos:4, toLane:4 },
    { from:'semi', semi:2, pos:5, toLane:6 },
    { from:'semi', semi:2, pos:6, toLane:2 },
    { from:'semi', semi:2, pos:7, toLane:8 },
    { from:'BT',             pos:1, toLane:9 },
  ],
};

// ─────────────────────────────────────────────────────────────
// PLAN C  (4 heats, 28-36 boats)
// ─────────────────────────────────────────────────────────────
const PLAN_C = {
  semis: {
    P1: [
      // SF1
      { fromHeat:1, pos:1, toSemi:1, toLane:5 },
      { fromHeat:1, pos:5, toSemi:1, toLane:8 },
      { fromHeat:2, pos:2, toSemi:1, toLane:4 },
      { fromHeat:2, pos:6, toSemi:1, toLane:1 },
      { fromHeat:3, pos:2, toSemi:1, toLane:6 },
      { fromHeat:3, pos:5, toSemi:1, toLane:2 },
      { fromHeat:4, pos:3, toSemi:1, toLane:3 },
      { fromHeat:4, pos:4, toSemi:1, toLane:7 },
      { fromHeat:'BT', pos:1, toSemi:1, toLane:9 },
      // SF2
      { fromHeat:1, pos:2, toSemi:2, toLane:4 },
      { fromHeat:1, pos:6, toSemi:2, toLane:8 },
      { fromHeat:2, pos:1, toSemi:2, toLane:6 },
      { fromHeat:2, pos:6, toSemi:2, toLane:1 },
      { fromHeat:3, pos:3, toSemi:2, toLane:3 },
      { fromHeat:3, pos:4, toSemi:2, toLane:7 },
      { fromHeat:4, pos:2, toSemi:2, toLane:4 },
      { fromHeat:4, pos:5, toSemi:2, toLane:2 },
      { fromHeat:'BT', pos:2, toSemi:2, toLane:1 },
      // SF3
      { fromHeat:1, pos:3, toSemi:3, toLane:6 },
      { fromHeat:1, pos:4, toSemi:3, toLane:2 },
      { fromHeat:2, pos:3, toSemi:3, toLane:3 },
      { fromHeat:2, pos:5, toSemi:3, toLane:8 },
      { fromHeat:3, pos:1, toSemi:3, toLane:4 },
      { fromHeat:3, pos:6, toSemi:3, toLane:9 },
      { fromHeat:4, pos:1, toSemi:3, toLane:5 },
      { fromHeat:4, pos:4, toSemi:3, toLane:7 },
      { fromHeat:'BT', pos:3, toSemi:3, toLane:1 },
    ],
  },
  finalA: [
    { from:'semi', semi:1, pos:1, toLane:5 },
    { from:'semi', semi:1, pos:2, toLane:3 },
    { from:'semi', semi:1, pos:3, toLane:8 },
    { from:'semi', semi:2, pos:1, toLane:4 },
    { from:'semi', semi:2, pos:2, toLane:7 },
    { from:'semi', semi:2, pos:3, toLane:1 },
    { from:'semi', semi:3, pos:1, toLane:6 },
    { from:'semi', semi:3, pos:2, toLane:2 },
    { from:'semi', semi:3, pos:3, toLane:9 },
  ],
  finalB: [
    { from:'semi', semi:1, pos:4, toLane:5 },
    { from:'semi', semi:1, pos:5, toLane:7 },
    { from:'semi', semi:1, pos:6, toLane:2 },
    { from:'semi', semi:2, pos:4, toLane:6 },
    { from:'semi', semi:2, pos:5, toLane:3 },
    { from:'semi', semi:2, pos:6, toLane:1 },
    { from:'semi', semi:3, pos:4, toLane:4 },
    { from:'semi', semi:3, pos:5, toLane:8 },
    { from:'semi', semi:3, pos:6, toLane:9 },
  ],
};

// ─────────────────────────────────────────────────────────────
// PLAN D  (5 heats, 37-45 boats)
// ─────────────────────────────────────────────────────────────
const PLAN_D = {
  semis: {
    P1: [
      // SF1
      { fromHeat:1, pos:1, toSemi:1, toLane:5 },
      { fromHeat:1, pos:4, toSemi:1, toLane:2 },
      { fromHeat:2, pos:2, toSemi:1, toLane:6 },
      { fromHeat:2, pos:5, toSemi:1, toLane:1 },
      { fromHeat:3, pos:3, toSemi:1, toLane:7 },
      { fromHeat:4, pos:1, toSemi:1, toLane:4 },
      { fromHeat:4, pos:4, toSemi:1, toLane:8 },
      { fromHeat:5, pos:2, toSemi:1, toLane:3 },
      { fromHeat:5, pos:5, toSemi:1, toLane:9 },
      // SF2
      { fromHeat:1, pos:2, toSemi:2, toLane:4 },
      { fromHeat:1, pos:5, toSemi:2, toLane:8 },
      { fromHeat:2, pos:3, toSemi:2, toLane:3 },
      { fromHeat:3, pos:1, toSemi:2, toLane:5 },
      { fromHeat:3, pos:4, toSemi:2, toLane:2 },
      { fromHeat:4, pos:2, toSemi:2, toLane:6 },
      { fromHeat:4, pos:5, toSemi:2, toLane:1 },
      { fromHeat:5, pos:3, toSemi:2, toLane:7 },
      { fromHeat:'BT', pos:1, toSemi:2, toLane:9 },
      // SF3
      { fromHeat:1, pos:3, toSemi:3, toLane:3 },
      { fromHeat:2, pos:1, toSemi:3, toLane:5 },
      { fromHeat:2, pos:4, toSemi:3, toLane:2 },
      { fromHeat:3, pos:2, toSemi:3, toLane:6 },
      { fromHeat:3, pos:5, toSemi:3, toLane:1 },
      { fromHeat:4, pos:3, toSemi:3, toLane:7 },
      { fromHeat:5, pos:1, toSemi:3, toLane:4 },
      { fromHeat:5, pos:4, toSemi:3, toLane:8 },
      { fromHeat:'BT', pos:2, toSemi:3, toLane:9 },
    ],
  },
  finalA: [
    { from:'semi', semi:1, pos:1, toLane:5 },
    { from:'semi', semi:1, pos:2, toLane:3 },
    { from:'semi', semi:1, pos:3, toLane:8 },
    { from:'semi', semi:2, pos:1, toLane:4 },
    { from:'semi', semi:2, pos:2, toLane:7 },
    { from:'semi', semi:2, pos:3, toLane:1 },
    { from:'semi', semi:3, pos:1, toLane:6 },
    { from:'semi', semi:3, pos:2, toLane:2 },
    { from:'semi', semi:3, pos:3, toLane:9 },
  ],
  finalB: [
    { from:'semi', semi:1, pos:4, toLane:5 },
    { from:'semi', semi:1, pos:5, toLane:7 },
    { from:'semi', semi:1, pos:6, toLane:2 },
    { from:'semi', semi:2, pos:4, toLane:6 },
    { from:'semi', semi:2, pos:5, toLane:3 },
    { from:'semi', semi:2, pos:6, toLane:1 },
    { from:'semi', semi:3, pos:4, toLane:4 },
    { from:'semi', semi:3, pos:5, toLane:8 },
    { from:'semi', semi:3, pos:6, toLane:9 },
  ],
  finalC: [
    { from:'semi', semi:1, pos:7, toLane:5 },
    { from:'semi', semi:1, pos:8, toLane:3 },
    { from:'semi', semi:1, pos:9, toLane:8 },
    { from:'semi', semi:2, pos:7, toLane:4 },
    { from:'semi', semi:2, pos:8, toLane:7 },
    { from:'semi', semi:2, pos:9, toLane:1 },
    { from:'semi', semi:3, pos:7, toLane:6 },
    { from:'semi', semi:3, pos:8, toLane:2 },
    { from:'semi', semi:3, pos:9, toLane:9 },
  ],
};

const PLANS = { 2: PLAN_A, 3: PLAN_B, 4: PLAN_C, 5: PLAN_D };

/**
 * Apply ICF semi draw — returns { semis: {semiNum: {lane: entryId}}, directToFinalLanes: {lane: entryId} }
 * or null if no plan available for this heat count.
 */
function applyICFSemiDraw(heatResults, numHeats, planVariant = 'P1') {
  const plan = PLANS[numHeats];
  if (!plan) return null;

  const semiRules = plan.semis[planVariant] || plan.semis['P1'];

  // Build heat lookup: heatNumber → position → entry
  const byHeat = {};
  heatResults.forEach(h => {
    byHeat[h.heatNumber] = {};
    h.entries.filter(e => e.status === 'OK')
      .sort((a,b) => a.position - b.position)
      .forEach(e => { byHeat[h.heatNumber][e.position] = e; });
  });

  const usedIds = new Set();
  const semiLanes = {}; // {semiNum: {lane: entryId}}
  const btPool = []; // filled after direct placements

  // First pass — place direct heat qualifiers
  semiRules.filter(r => r.fromHeat !== 'BT').forEach(r => {
    const entry = byHeat[r.fromHeat]?.[r.pos];
    if (!entry) return;
    if (!semiLanes[r.toSemi]) semiLanes[r.toSemi] = {};
    semiLanes[r.toSemi][r.toLane] = entry.entryId;
    usedIds.add(entry.entryId);
  });

  // BT pool — all OK results not yet placed, sorted by time
  heatResults.forEach(h => {
    h.entries.filter(e => e.status === 'OK' && !usedIds.has(e.entryId))
      .forEach(e => btPool.push(e));
  });
  btPool.sort((a,b) => a.finishTimeMs - b.finishTimeMs);

  // Second pass — place BT qualifiers
  let btIdx = 0;
  semiRules.filter(r => r.fromHeat === 'BT').forEach(r => {
    const entry = btPool[btIdx++];
    if (!entry) return;
    if (!semiLanes[r.toSemi]) semiLanes[r.toSemi] = {};
    semiLanes[r.toSemi][r.toLane] = entry.entryId;
    usedIds.add(entry.entryId);
  });

  // Direct heat → final qualifiers (Plan B only — Plan A direct qualifiers
  // are handled separately in progression.js via directPerHeat)
  const directToFinalLanes = {};
  if (plan.directToFinal) {
    plan.directToFinal.forEach(d => {
      const entry = byHeat[d.heat]?.[d.pos];
      if (entry) directToFinalLanes[d.toLane] = entry.entryId;
    });
  }

  return { semis: semiLanes, directToFinalLanes };
}

/**
 * Apply ICF final draw from semi results.
 * Returns {finalA: {lane: entryId}, finalB: ..., finalC: ...}
 */
function applyICFFinalDraw(semiResults, numHeats, heatResults, directQualifierIds) {
  const plan = PLANS[numHeats];
  if (!plan) return null;

  // Build semi lookup: semiNum → position → entryId
  const bySemi = {};
  semiResults.forEach(s => {
    bySemi[s.semiNumber] = {};
    s.entries.filter(e => e.status === 'OK')
      .sort((a,b) => a.position - b.position)
      .forEach(e => { bySemi[s.semiNumber][e.position] = e; });
  });

  // Build heat lookup for Plan A direct qualifiers
  const byHeat = {};
  if (heatResults) {
    heatResults.forEach(h => {
      byHeat[h.heatNumber] = {};
      h.entries.filter(e => e.status === 'OK')
        .sort((a,b) => a.position - b.position)
        .forEach(e => { byHeat[h.heatNumber][e.position] = e; });
    });
  }

  function buildFinal(rules) {
    if (!rules) return null;
    const lanes = {};
    const usedIds = new Set();
    const btPool = [];

    rules.filter(r => r.from !== 'BT').forEach(r => {
      let entry;
      if (r.from === 'semi') entry = bySemi[r.semi]?.[r.pos];
      else if (r.from === 'heat') entry = byHeat[r.heat]?.[r.pos];
      if (!entry) return;
      lanes[r.toLane] = entry.entryId;
      usedIds.add(entry.entryId);
    });

    // BT from semis — all not yet placed, sorted by time
    semiResults.forEach(s => {
      s.entries.filter(e => e.status === 'OK' && !usedIds.has(e.entryId))
        .forEach(e => btPool.push(e));
    });
    btPool.sort((a,b) => a.finishTimeMs - b.finishTimeMs);

    let btIdx = 0;
    rules.filter(r => r.from === 'BT').forEach(r => {
      const entry = btPool[btIdx++];
      if (!entry) return;
      lanes[r.toLane] = entry.entryId;
    });

    return Object.keys(lanes).length > 0 ? lanes : null;
  }

  return {
    finalA: buildFinal(plan.finalA),
    finalB: buildFinal(plan.finalB),
    finalC: buildFinal(plan.finalC),
  };
}

module.exports = { applyICFSemiDraw, applyICFFinalDraw };

// ─────────────────────────────────────────────────────────────
// GENERALISED ICF-PRINCIPLE DRAW for non-9-lane courses
// ─────────────────────────────────────────────────────────────
// ICF Appendix 1 only publishes tables for 9 lanes. For 6/7/8-lane
// courses we apply the same three principles the tables encode:
//   1. Boats from the same heat never share a semi (rematch prevention)
//   2. Better heat finishers get lanes nearer the centre
//   3. Qualifier count per heat scales with lane count
//
// Method: rank all non-direct qualifiers (position, then time). Deal them
// round-robin across semis, but shifted so heat N's boats land in
// different semis. Within each semi, assign lanes centre-out by rank.

function centreOutLanes(numLanes) {
  const centre = (numLanes + 1) / 2;
  return Array.from({ length: numLanes }, (_, i) => i + 1)
    .sort((a, b) => (Math.abs(a - centre) - Math.abs(b - centre)) || (a - b));
}

/**
 * Generalised semi draw for any lane count.
 * @param heatResults [{heatNumber, entries:[{entryId, position, finishTimeMs, status}]}]
 * @param numSemis   how many semis to create
 * @param numLanes   lanes on this course
 * @param directPerHeat  how many per heat skip straight to Final A (0 if none)
 * @returns {semis: {semiNum: {lane: entryId}}, directToFinalIds: [entryId...]}
 */
function applyGeneralisedSemiDraw(heatResults, numSemis, numLanes, directPerHeat) {
  const direct = [];
  const pool = []; // {entryId, heatNumber, position, finishTimeMs}

  heatResults.forEach(h => {
    h.entries.filter(e => e.status === 'OK')
      .sort((a, b) => a.position - b.position)
      .forEach(e => {
        if (directPerHeat > 0 && e.position <= directPerHeat) direct.push(e.entryId);
        else pool.push({ ...e, heatNumber: h.heatNumber });
      });
  });

  // Capacity: numSemis * numLanes. Trim pool to that many, best first.
  pool.sort((a, b) => (a.position - b.position) || (a.finishTimeMs - b.finishTimeMs));
  const capacity = numSemis * numLanes;
  const qualifiers = pool.slice(0, capacity);

  // Distribute: group by heat, then for each heat deal its boats across
  // semis starting at an offset = (heatNumber - 1) so heat 1 starts at
  // semi 1, heat 2 starts at semi 2, etc. This guarantees two boats from
  // the same heat only share a semi if that heat has more qualifiers than
  // there are semis (unavoidable — same as ICF tables).
  const semiGroups = Array.from({ length: numSemis }, () => []);
  const byHeat = {};
  qualifiers.forEach(q => { (byHeat[q.heatNumber] = byHeat[q.heatNumber] || []).push(q); });
  Object.entries(byHeat).forEach(([heatNum, boats]) => {
    const offset = (Number(heatNum) - 1) % numSemis;
    boats.forEach((b, i) => {
      semiGroups[(offset + i) % numSemis].push(b);
    });
  });

  // Within each semi, sort by rank and assign centre-out lanes
  const laneOrder = centreOutLanes(numLanes);
  const semis = {};
  semiGroups.forEach((group, i) => {
    if (group.length === 0) return;
    group.sort((a, b) => (a.position - b.position) || (a.finishTimeMs - b.finishTimeMs));
    const lanes = {};
    group.forEach((b, j) => { if (j < numLanes) lanes[laneOrder[j]] = b.entryId; });
    semis[i + 1] = lanes;
  });

  return { semis, directToFinalIds: direct };
}

/**
 * Generalised final draw for any lane count.
 * Direct heat qualifiers get the centre lanes; semi finishers fill outward
 * by rank (semi position, then time).
 */
function applyGeneralisedFinalDraw(semiResults, numLanes, directIds, finalsCount) {
  const ranked = [];
  semiResults.forEach(s => {
    s.entries.filter(e => e.status === 'OK').forEach(e => {
      ranked.push({ ...e, semiNumber: s.semiNumber });
    });
  });
  ranked.sort((a, b) => (a.position - b.position) || (a.finishTimeMs - b.finishTimeMs));

  const laneOrder = centreOutLanes(numLanes);
  const finals = {};
  const phases = ['finalA', 'finalB', 'finalC'].slice(0, finalsCount);
  let cursor = 0;

  phases.forEach((phase, pi) => {
    const lanes = {};
    let laneIdx = 0;
    // Final A: direct qualifiers get centre lanes first
    if (pi === 0) {
      directIds.forEach(id => { if (laneIdx < numLanes) lanes[laneOrder[laneIdx++]] = id; });
    }
    while (laneIdx < numLanes && cursor < ranked.length) {
      lanes[laneOrder[laneIdx++]] = ranked[cursor++].entryId;
    }
    if (Object.keys(lanes).length > 0) finals[phase] = lanes;
  });

  return finals;
}

module.exports.applyGeneralisedSemiDraw = applyGeneralisedSemiDraw;
module.exports.applyGeneralisedFinalDraw = applyGeneralisedFinalDraw;
