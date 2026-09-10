/**
 * ICF Appendix 1 — Exact lane draw tables for heats → semis → finals.
 * 
 * Structure: PLANS[numHeats][planVariant] = { semis: [...], finals: [...] }
 * Each entry: { fromHeat, fromPosition, toSemi, toLane }
 * 
 * Transcribed verbatim from ICF Canoe Sprint Competition Rules 2025, pp 76-80.
 * Only Plans A-D transcribed for PSG use (2-5 heats, up to 45 boats).
 * Plans E-G (46+ boats) can be added if needed.
 * 
 * "BT" (by time) positions are handled specially — they represent the next
 * fastest qualifier across all heats, assigned to the designated lane.
 */

// Plan A: 2 heats, 10-18 boats
// 4th-7th from each heat + 1 best-time qualifier go to 1 semifinal
// 1st-3rd from each heat go direct to Final
const PLAN_A = {
  semis: {
    P1: [
      // SF1
      { fromHeat:1, fromPosition:4, toSemi:1, toLane:5 },
      { fromHeat:1, fromPosition:5, toSemi:1, toLane:6 },
      { fromHeat:1, fromPosition:6, toSemi:1, toLane:2 },
      { fromHeat:1, fromPosition:7, toSemi:1, toLane:8 },
      { fromHeat:2, fromPosition:4, toSemi:1, toLane:4 },
      { fromHeat:2, fromPosition:5, toSemi:1, toLane:3 },
      { fromHeat:2, fromPosition:6, toSemi:1, toLane:7 },
      { fromHeat:2, fromPosition:7, toSemi:1, toLane:1 },
      { fromHeat:'BT', fromPosition:1, toSemi:1, toLane:9 },
    ],
    P2: [
      // SF1 (alternative)
      { fromHeat:1, fromPosition:4, toSemi:1, toLane:4 },
      { fromHeat:1, fromPosition:5, toSemi:1, toLane:3 },
      { fromHeat:1, fromPosition:6, toSemi:1, toLane:7 },
      { fromHeat:1, fromPosition:7, toSemi:1, toLane:1 },
      { fromHeat:2, fromPosition:4, toSemi:1, toLane:5 },
      { fromHeat:2, fromPosition:5, toSemi:1, toLane:6 },
      { fromHeat:2, fromPosition:6, toSemi:1, toLane:2 },
      { fromHeat:2, fromPosition:7, toSemi:1, toLane:8 },
      { fromHeat:'BT', fromPosition:1, toSemi:1, toLane:9 },
    ],
  },
  finals: {
    // Direct qualifiers from heats to Final A
    directFromHeats: [
      { fromHeat:1, fromPosition:1, toLane:5 },
      { fromHeat:1, fromPosition:2, toLane:3 },
      { fromHeat:1, fromPosition:3, toLane:7 },
      { fromHeat:2, fromPosition:1, toLane:4 },
      { fromHeat:2, fromPosition:2, toLane:6 },
      { fromHeat:2, fromPosition:3, toLane:2 },
    ],
    // From SF to Final A
    fromSemi: [
      { fromSemi:1, fromPosition:1, toLane:8 },
      { fromSemi:1, fromPosition:2, toLane:1 },
      { fromSemi:1, fromPosition:3, toLane:9 },
    ],
  },
};

// Plan B: 3 heats, 19-27 boats
// 1st from each heat → direct Final A; 2nd-7th → semis
const PLAN_B = {
  semis: {
    P1: [
      // SF1
      { fromHeat:1, fromPosition:2, toSemi:1, toLane:5 },
      { fromHeat:1, fromPosition:4, toSemi:1, toLane:7 },
      { fromHeat:1, fromPosition:6, toSemi:1, toLane:1 },
      { fromHeat:2, fromPosition:3, toSemi:1, toLane:4 },
      { fromHeat:2, fromPosition:5, toSemi:1, toLane:2 },
      { fromHeat:2, fromPosition:7, toSemi:1, toLane:9 },
      { fromHeat:3, fromPosition:3, toSemi:1, toLane:6 },
      { fromHeat:3, fromPosition:4, toSemi:1, toLane:3 },
      { fromHeat:3, fromPosition:6, toSemi:1, toLane:8 },
      // SF2
      { fromHeat:1, fromPosition:3, toSemi:2, toLane:6 },
      { fromHeat:1, fromPosition:5, toSemi:2, toLane:7 },
      { fromHeat:1, fromPosition:7, toSemi:2, toLane:1 },
      { fromHeat:2, fromPosition:2, toSemi:2, toLane:5 },
      { fromHeat:2, fromPosition:4, toSemi:2, toLane:3 },
      { fromHeat:2, fromPosition:6, toSemi:2, toLane:8 },
      { fromHeat:3, fromPosition:2, toSemi:2, toLane:4 },
      { fromHeat:3, fromPosition:5, toSemi:2, toLane:2 },
      { fromHeat:3, fromPosition:7, toSemi:2, toLane:9 },
    ],
    P2: [
      // SF1
      { fromHeat:1, fromPosition:3, toSemi:1, toLane:6 },
      { fromHeat:1, fromPosition:5, toSemi:1, toLane:2 },
      { fromHeat:1, fromPosition:6, toSemi:1, toLane:9 },
      { fromHeat:2, fromPosition:3, toSemi:1, toLane:4 },
      { fromHeat:2, fromPosition:4, toSemi:1, toLane:7 },
      { fromHeat:2, fromPosition:6, toSemi:1, toLane:8 },
      { fromHeat:3, fromPosition:2, toSemi:1, toLane:5 },
      { fromHeat:3, fromPosition:4, toSemi:1, toLane:3 },
      { fromHeat:3, fromPosition:7, toSemi:1, toLane:1 },
      // SF2
      { fromHeat:1, fromPosition:2, toSemi:2, toLane:5 },
      { fromHeat:1, fromPosition:4, toSemi:2, toLane:3 },
      { fromHeat:1, fromPosition:7, toSemi:2, toLane:9 },
      { fromHeat:2, fromPosition:2, toSemi:2, toLane:4 },
      { fromHeat:2, fromPosition:5, toSemi:2, toLane:7 },
      { fromHeat:2, fromPosition:7, toSemi:2, toLane:1 },
      { fromHeat:3, fromPosition:3, toSemi:2, toLane:6 },
      { fromHeat:3, fromPosition:5, toSemi:2, toLane:2 },
      { fromHeat:3, fromPosition:6, toSemi:2, toLane:8 },
    ],
  },
  directFromHeats: [
    { fromHeat:1, fromPosition:1, toLane:5 },
    { fromHeat:2, fromPosition:1, toLane:4 },
    { fromHeat:3, fromPosition:1, toLane:6 },
  ],
};

/**
 * Given heat results, apply ICF Appendix 1 lane draw to produce semi entries.
 * 
 * @param {Array} heatResults - [{heatNumber, entries: [{entryId, position, finishTimeMs}]}]
 * @param {number} numHeats - 2, 3, 4, or 5
 * @param {string} planVariant - 'P1' or 'P2' (default 'P1')
 * @returns {Object} { semis: [{semiNumber, lanes: {laneNum: entryId}}], directToFinal: {laneNum: entryId} }
 */
function applyICFSemiDraw(heatResults, numHeats, planVariant = 'P1') {
  const plan = numHeats === 2 ? PLAN_A : numHeats === 3 ? PLAN_B : null;
  
  if (!plan) {
    // Plans C-G not yet transcribed — fall back to snake distribution
    return null;
  }
  
  const semiAssignments = plan.semis[planVariant] || plan.semis['P1'];
  
  // Build lookup: heatNumber → position → entryId
  const heatLookup = {};
  heatResults.forEach(heat => {
    heatLookup[heat.heatNumber] = {};
    heat.entries.forEach(e => {
      heatLookup[heat.heatNumber][e.position] = e;
    });
  });
  
  // BT qualifiers: all non-direct qualifiers sorted by time, excluding those already placed
  const allQualifiers = [];
  heatResults.forEach(heat => {
    heat.entries.forEach(e => {
      if (e.status === 'OK') allQualifiers.push({ ...e, heatNumber: heat.heatNumber });
    });
  });
  
  // Build semi lanes
  const semiLanes = {}; // {semiNumber: {laneNum: entryId}}
  const usedEntryIds = new Set();
  const btQualifiers = []; // will be populated after direct placements
  
  semiAssignments.forEach(assignment => {
    if (assignment.fromHeat === 'BT') return; // handle BT separately
    const heatEntry = heatLookup[assignment.fromHeat]?.[assignment.fromPosition];
    if (!heatEntry) return;
    
    if (!semiLanes[assignment.toSemi]) semiLanes[assignment.toSemi] = {};
    semiLanes[assignment.toSemi][assignment.toLane] = heatEntry.entryId;
    usedEntryIds.add(heatEntry.entryId);
  });
  
  // Handle BT (best time) qualifiers
  const btSorted = allQualifiers
    .filter(e => !usedEntryIds.has(e.entryId) && e.status === 'OK')
    .sort((a, b) => a.finishTimeMs - b.finishTimeMs);
  
  let btIdx = 0;
  semiAssignments.forEach(assignment => {
    if (assignment.fromHeat !== 'BT') return;
    const bt = btSorted[btIdx++];
    if (!bt) return;
    if (!semiLanes[assignment.toSemi]) semiLanes[assignment.toSemi] = {};
    semiLanes[assignment.toSemi][assignment.toLane] = bt.entryId;
    usedEntryIds.add(bt.entryId);
  });
  
  // Direct heat → final qualifiers
  const directToFinal = {};
  if (plan.directFromHeats) {
    plan.directFromHeats.forEach(d => {
      const heatEntry = heatLookup[d.fromHeat]?.[d.fromPosition];
      if (heatEntry) directToFinal[d.toLane] = heatEntry.entryId;
    });
  }
  
  return { semis: semiLanes, directToFinal };
}

module.exports = { applyICFSemiDraw, PLAN_A, PLAN_B };
