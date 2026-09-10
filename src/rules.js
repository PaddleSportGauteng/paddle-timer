// Rules engine — ICF Canoe Sprint Competition Rules 2025 + PSA Paddlers
// Handbook amendments. Every rule below is commented with its source so
// it's easy to check against the rulebook and correct if we got a detail
// wrong.
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

// ICF Chapter 3 "BOATS SPECIFICATIONS" - minimum weight (kg)
// PSA 2.2.1 adds the Guppy class minimum (10kg), which ICF doesn't cover.
//
// Every figure here comes from a published rule. K3 is deliberately
// ABSENT: ICF has no K3 class, and the PSA handbook mentions K3 only
// once (2.4.2, treating K3s and K4s as K2s for grading) without giving a
// weight. A guessed minimum could wrongly disqualify a boat, so if a K3
// is ever weighed the station says "no minimum weight on file" and
// records the weight without passing judgement — which is the honest
// answer. Add K3 here if your federation publishes a figure.
const MIN_WEIGHT_KG = {
  K1: 12, K2: 18, K4: 30,
  C1: 14, C2: 20, C4: 30,
  Guppy: 10,
};

// PSA Handbook 9.4 / 9.6 / 9.8 etc — minimum boats entered in a category
// to award each medal colour. Below Gold's minimum: no medals at all, but
// the race still happens and results still stand. This is a flag for the
// prize table, never a reason to stop someone racing.
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
  const plan = lanes === 9 ? PROGRESSION_PLANS[numHeats] : null;
  if (!plan) {
    const why = lanes !== 9
      ? `this venue has ${lanes} lanes — ICF Appendix 1's published tables only cover the standard 9-lane course`
      : `${entryCount} entries needs ${numHeats} heats — beyond ICF Appendix 1's largest published plan (Plan G, 8 heats / 72 boats)`;
    return {
      // rounds still lists the full heat->semi->final sequence (just
      // without automatic quotas) so the manual "advance next round" tool
      // in Race Program knows semi/final are valid rounds to create.
      runnable: true, rounds: ['heat', 'semi', 'final'], heatsNeeded: numHeats, unsupported: true,
      note: `${why}. Heats will be drawn, but semi/final advancement isn't automated — advance manually in Race Program.`,
    };
  }
  return {
    runnable: true,
    rounds: ['heat', 'semi', 'final'],
    heatsNeeded: numHeats,
    directPerHeat: plan.directPerHeat,
    numSemis: plan.numSemis,
    finalsNeeded: finalsNeeded(entryCount),
    note: `ICF Appendix 1 Plan for ${numHeats} heats: ${plan.directPerHeat > 0 ? `top ${plan.directPerHeat} per heat go direct to Final A, rest` : 'everyone'} advance through ${plan.numSemis} semifinal(s) into ${finalsNeeded(entryCount)} final(s).`,
  };
}

/**
 * PSA medal-minimum check. Takes a ranked (1st, 2nd, 3rd...) list for a
 * SINGLE category (already split out from any combined start) and returns
 * which places are medal-eligible, flagging the rest without hiding them.
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
 * ICF Ch.3 boat weight minimums (+ PSA Guppy addition). Called after a
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
    dqReason: passed ? null : `Underweight: ${measuredWeightKg}kg < ${min}kg minimum for ${boatClass} (ICF Ch.3 / PSA 2.2.1).`,
  };
}

/**
 * PSA weigh-in requirement (office rule, not a published PSA clause —
 * confirmed with the user directly): every FINAL result's podium
 * (positions 1-3, or however many finishers there are if fewer than 3)
 * must be weighed before the race can be considered final. Weighing
 * anyone beyond the podium is entirely at the office's discretion —
 * there's no cap, and it's never REQUIRED, so it never blocks
 * completion on its own.
 *
 * `ranked` is the finish-order list for ONE category (already split from
 * any combined start), each item needing at least an `entryId`.
 * `weighedEntryIds` is a Set (or array) of entryIds that have a weigh-in
 * recorded, regardless of pass/fail — the requirement is that they were
 * WEIGHED, not that they passed.
 */
function computeWeighInRequirement(ranked, weighedEntryIds) {
  const weighed = weighedEntryIds instanceof Set ? weighedEntryIds : new Set(weighedEntryIds);
  const required = Math.min(3, ranked.length); // min 3, or all if fewer than 3 finished
  const weighedCount = ranked.filter((r) => weighed.has(r.entryId)).length;
  const complete = weighedCount >= required;
  const flag = complete ? null
    : `${weighedCount} of ${required} required weigh-ins done — ${required - weighedCount} more needed before results are official.`;
  return {
    complete,
    requiredCount: required,
    weighedCount,
    flag,
  };
}

module.exports = { DEFAULT_LANES, centerOutLaneOrder, MIN_WEIGHT_KG, MEDAL_MINIMUMS, PROGRESSION_PLANS, finalsNeeded, decideFormat, computeMedalEligibility, computeWeighInRequirement, checkWeight };
