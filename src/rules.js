// Rules engine. RACING follows ICF Canoe Sprint Competition Rules 2025
// (the PSA Paddlers Handbook 1.1 states "Races are to be run under the ICF
// racing rules"). AWARDS follow the PSA Paddlers Handbook 2026, which
// adds rules ICF does not have: Guppy boat weight (1.1.2) and medal
// minimums by entry count (9.4). Every rule below cites its source.
//
// LANE COUNT: venues differ (9 is the ICF/international standard, but
// many club/provincial courses run 6, 7, or 8). Lane count is set PER
// MEET (see meets.js) — DEFAULT_LANES below is only the fallback for old
// meets created before this was configurable. Every function here takes
// `lanes` as a parameter rather than assuming a fixed number.
//
// IMPORTANT: the automatic ICF Appendix 1 progression table
// (PROGRESSION_PLANS below) is only valid for a 9-lane course — that's
// what the published ICF document defines. There is no ICF table for
// other lane counts, so decideFormat() only applies it when lanes===9;
// otherwise heats are drawn but semi/final advancement falls back to
// manual review in Race Program (same mechanism used for fields ICF's
// table doesn't cover at all, e.g. >72 boats).

const DEFAULT_LANES = 9;

// Centre-out lane order for a course with `numLanes` lanes — e.g. for 9
// lanes: 5,4,6,3,7,2,8,1,9 (fastest-looking draw order lands near the
// middle, the common convention absent real seed times). Generalizes
// cleanly to any lane count.
function centerOutLaneOrder(numLanes) {
  const center = (numLanes + 1) / 2;
  return Array.from({ length: numLanes }, (_, i) => i + 1)
    .sort((a, b) => (Math.abs(a - center) - Math.abs(b - center)) || (a - b));
}

// ICF Chapter 3 "BOATS SPECIFICATIONS" - minimum weight (kg).
// Guppy (10kg) from PSA Paddlers Handbook 1.1.2 — ICF has no Guppy class.
//
// K3 is deliberately ABSENT: ICF has no K3 class and publishes no weight.
// A guessed minimum could wrongly disqualify a boat, so if a K3 is ever
// weighed the station records the weight with "no minimum on file".
const MIN_WEIGHT_KG = {
  K1: 12, K2: 18, K4: 30,
  C1: 14, C2: 20, C4: 30,
  Guppy: 10,
};

// PSA Paddlers Handbook 9.4 "Sprint Racing Championships" — minimum
// boats entered before each medal colour is awarded: Gold 3, Silver 5,
// Bronze 5. NOTE: this differs from ICF 1.8.6 (which has no entry-count
// minimum) — PSA governs medal awards at South African events, so PSA
// applies here. Below Gold's minimum the race still runs and results
// still stand; this only affects the prize table.
const MEDAL_MINIMUMS = { gold: 3, silver: 5, bronze: 5 };

// ICF Appendix 1 "Division Systems" — heat/semifinal/final progression.
// Transcribed from the clear prose summary for each plan (e.g. Plan A,
// 10-18 boats / 2 heats: "1st-3rd to Final [direct]" + "4th-7th + 1x8th BT
// to SF" + SF "1st-3rd to Final"). Verified against every plan A-G in the
// 2025 rules (10 to 72 boats / 2 to 8 heats). NOT covered: entry counts
// needing more than 8 heats (>72 boats) — flagged rather than guessed.
//
// What IS reproduced: how many boats go straight from heats to Final A
// (directPerHeat, guaranteed one-per-heat fairness — e.g. "the heat
// winner always reaches the final"), how many semifinals are run, and how
// many named finals (A/B/C) the field is big enough for (ICF 5.1.4).
//
// What ISN'T reproduced: the exact seeded LANE NUMBER each qualifier gets
// within a semi or final. ICF Appendix 1 specifies that precisely (visible
// as the "4/H1...L5" style notation); we use our own centre-out lane draw
// instead. Fine for club/provincial timing; not ICF-certified seeding.
const PROGRESSION_PLANS = {
  2: { directPerHeat: 3, numSemis: 1 }, // Plan A, 10-18 boats
  3: { directPerHeat: 1, numSemis: 2 }, // Plan B, 19-27 boats
  4: { directPerHeat: 0, numSemis: 3 }, // Plan C, 28-36 boats
  5: { directPerHeat: 0, numSemis: 3 }, // Plan D, 37-45 boats
  6: { directPerHeat: 0, numSemis: 3 }, // Plan E, 46-54 boats
  7: { directPerHeat: 0, numSemis: 4 }, // Plan F, 55-63 boats
  8: { directPerHeat: 0, numSemis: 4 }, // Plan G, 64-72 boats
};

/**
 * ICF 5.1.4: B final only above 18 boats in the category; C final only
 * above 36. This is independent of which Plan applies.
 */
function finalsNeeded(entryCount) {
  if (entryCount <= 18) return 1;
  if (entryCount <= 36) return 2;
  return 3;
}

/**
 * Full ICF 5.1.1 / Appendix 1 format decision. `lanes` comes from the
 * meet's own configured course size — see meets.js / DEFAULT_LANES above.
 */
function decideFormat(entryCount, lanes = DEFAULT_LANES) {
  if (entryCount < 3) {
    return { runnable: false, reason: 'Fewer than 3 boats entered (ICF 5.1.1) — flag for organiser review, do not auto-schedule.' };
  }
  if (entryCount <= lanes) {
    return { runnable: true, rounds: ['final'], heatsNeeded: 1, note: 'Entries fit in one final — no heats needed (ICF 5.1.1).' };
  }
  const numHeats = Math.ceil(entryCount / lanes);

  // 9-lane: use the exact published ICF Appendix 1 plan
  if (lanes === 9) {
    const plan = PROGRESSION_PLANS[numHeats];
    if (!plan) {
      return {
        runnable: true, rounds: ['heat', 'semi', 'final'], heatsNeeded: numHeats, unsupported: true,
        note: `${entryCount} entries needs ${numHeats} heats — beyond ICF Appendix 1's largest published plan (Plan G, 8 heats / 72 boats). Heats drawn; advance manually in Race Program.`,
      };
    }
    return {
      runnable: true, rounds: ['heat', 'semi', 'final'], heatsNeeded: numHeats,
      directPerHeat: plan.directPerHeat, numSemis: plan.numSemis, finalsNeeded: finalsNeeded(entryCount),
      icfExact: true,
      note: `ICF Appendix 1 Plan for ${numHeats} heats: ${plan.directPerHeat > 0 ? `top ${plan.directPerHeat} per heat go direct to Final A, rest` : 'everyone'} advance through ${plan.numSemis} semifinal(s) into ${finalsNeeded(entryCount)} final(s).`,
    };
  }

  // Non-9-lane: apply ICF principles generalised to this course.
  // Semis needed = enough to hold everyone who isn't a direct qualifier.
  // Direct qualifiers: same ratio as ICF (3/heat for 2 heats, 1/heat for 3 heats, 0 for 4+).
  const directPerHeat = numHeats === 2 ? Math.max(1, Math.floor(lanes / 3)) : numHeats === 3 ? 1 : 0;
  const nonDirect = entryCount - directPerHeat * numHeats;
  const numSemis = Math.max(1, Math.ceil(nonDirect / lanes));
  return {
    runnable: true, rounds: ['heat', 'semi', 'final'], heatsNeeded: numHeats,
    directPerHeat, numSemis, finalsNeeded: finalsNeeded(entryCount),
    icfExact: false, generalised: true,
    note: `${lanes}-lane course — ICF principles applied (no rematches, centre lanes to better finishers): ${directPerHeat > 0 ? `top ${directPerHeat} per heat direct to Final A, rest` : 'everyone'} through ${numSemis} semi(s) into ${finalsNeeded(entryCount)} final(s).`,
  };
}

/**
 * PSA 9.4 medal eligibility for a single category (already split out from
 * any combined start per PSA 1.2.1/1.2.2). Returns which places are
 * medal-eligible and a flag explaining any withheld medals.
 */
function computeMedalEligibility(rankedEntryCount) {
  return {
    gold: rankedEntryCount >= MEDAL_MINIMUMS.gold,
    silver: rankedEntryCount >= MEDAL_MINIMUMS.silver,
    bronze: rankedEntryCount >= MEDAL_MINIMUMS.bronze,
    flag: rankedEntryCount < MEDAL_MINIMUMS.gold
      ? `Only ${rankedEntryCount} boat(s) — below minimum of ${MEDAL_MINIMUMS.gold} for any medal (PSA 9.4). Race stands, no medals awarded.`
      : rankedEntryCount < MEDAL_MINIMUMS.silver
      ? `${rankedEntryCount} boats — Gold only awarded, below minimum of ${MEDAL_MINIMUMS.silver} for Silver/Bronze (PSA 9.4).`
      : null,
  };
}

/**
 * ICF Ch.3 boat weight minimums (Guppy from PSA 1.1.2). Called after a
 * boat finishes and is weighed. Returns whether it passes and, if not,
 * the DQ reason to attach to the result.
 */
function checkWeight(boatClass, measuredWeightKg) {
  const min = MIN_WEIGHT_KG[boatClass];
  if (min == null) {
    return { checked: false, passed: null, note: `No minimum weight on file for boat class "${boatClass}" — weight recorded, but no pass/fail judgement made.` };
  }
  const passed = measuredWeightKg >= min;
  return {
    checked: true,
    passed,
    minRequiredKg: min,
    dqReason: passed ? null : `Underweight: ${measuredWeightKg}kg < ${min}kg minimum for ${boatClass} (${boatClass === 'Guppy' ? 'PSA 1.1.2' : 'ICF Ch.3'}).`,
  };
}

module.exports = { DEFAULT_LANES, centerOutLaneOrder, finalsNeeded, decideFormat, computeMedalEligibility, checkWeight };
