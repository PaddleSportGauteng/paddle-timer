// Automatic round advancement. Called every time a race is marked
// 'finished' (see races.js). Checks whether that completes a whole round
// for the event, and if so, creates the next round automatically — no
// office review step. The office can still edit/scratch/delete afterward
// in Race Program, same as any drawn race, before hitting Finalise.

const db = require('./db');
const rules = require('./rules');
const { applyICFSemiDraw, applyICFFinalDraw, applyGeneralisedSemiDraw, applyGeneralisedFinalDraw } = require('./icf-lane-draw');

function assignLanes(entryIds, numLanes) {
  const laneOrder = rules.centerOutLaneOrder(numLanes);
  const lanes = {};
  entryIds.forEach((id, i) => { lanes[laneOrder[i]] = id; });
  return lanes;
}

// Snake/boustrophedon distribution across N groups, so strength is spread
// evenly rather than stacking the fastest qualifiers into one semifinal.
function snakeGroupIndices(count, numGroups) {
  const seq = [];
  let g = 0, dir = 1;
  for (let i = 0; i < count; i++) {
    seq.push(g);
    if (numGroups <= 1) continue;
    if (g + dir >= numGroups || g + dir < 0) dir *= -1;
    g += dir;
  }
  return seq;
}

function distributeSnake(rankedIds, numGroups) {
  const groups = Array.from({ length: numGroups }, () => []);
  const seq = snakeGroupIndices(rankedIds.length, numGroups);
  rankedIds.forEach((id, i) => groups[seq[i]].push(id));
  return groups;
}

function nextRaceNumber(database, meetId) {
  const meet = database.meets[meetId];
  const n = meet.nextRaceNumber || 1;
  meet.nextRaceNumber = n + 1;
  return n;
}

// When a round auto-advances, schedule the new round to start no earlier
// than (latest actual finish time of the races that fed it) + the meet's
// configured rest gap. Uses REAL finish times (race.finishedAt), not the
// planned schedule — race day always drifts from paper, so this keeps
// rest periods honest even when heats run early/late. Falls back to null
// (unscheduled, office sets it manually) if the source races haven't
// actually finished yet somehow.
function computeRestScheduledLabel(database, sourceRaces, meetId) {
  const meet = database.meets[meetId];
  const restMs = ((meet && meet.restMinutes != null ? meet.restMinutes : 20)) * 60000;
  const finishTimes = sourceRaces.map((r) => r.finishedAt).filter(Boolean);
  if (finishTimes.length === 0) return null;
  const latest = Math.max(...finishTimes) + restMs;
  const d = new Date(latest);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function newRace(database, eventId, phase, heatNumber, lanes, scheduledLabel) {
  const event = database.events[eventId];
  const raceId = db.nextId();
  database.races[raceId] = {
    id: raceId, eventId, phase, heatNumber,
    raceNumber: nextRaceNumber(database, event.meetId), published: false,
    scheduledLabel: scheduledLabel || null, status: 'pending', startTimeMs: null, lanes,
  };
  return database.races[raceId];
}

// All 'OK' finishers across the given races, globally ranked by (their
// position within their own race) then (their time) — exactly the ICF
// "1st-2nd + 1x3rd BT" style notation: rank by placing tier first, then
// fill/break ties by time.
function rankedFinishers(database, races) {
  const list = [];
  races.forEach((race) => {
    const results = database.raceResults[race.id] || {};
    Object.entries(results).forEach(([entryId, r]) => {
      if (r.status !== 'OK') return;
      const entry = database.entries[entryId];
      if (!entry || entry.status !== 'active') return;
      list.push({ entryId, position: r.position, finishTimeMs: r.finishTimeMs });
    });
  });
  list.sort((a, b) => (a.position - b.position) || (a.finishTimeMs - b.finishTimeMs));
  return list;
}

// Final A gets the direct qualifiers first, then the fastest of the
// ranked (semi or heat) pool fills its remaining lanes. Final B, then
// Final C (if the field is big enough per ICF 5.1.4) take the next
// chunks of `lanes` from the pool in order. Anyone left over doesn't
// advance further — matches ICF's "rest out" after the last named final.
function createFinals(database, event, directIds, rankedPoolIds, sourceRaces, existingFinalRaces) {
  const meet = database.meets[event.meetId];
  const meetLanes = (meet && meet.lanes) || rules.DEFAULT_LANES;
  const finalsCount = event.plan.finalsNeeded || 1;
  const scheduledLabel = computeRestScheduledLabel(database, sourceRaces || [], event.meetId);

  // Try ICF exact final draw
  const allRaces = Object.values(database.races).filter(r => r.eventId === event.id);
  const heatRaces = allRaces.filter(r => r.phase === 'heat' && r.status === 'finished');
  const semiRaces = allRaces.filter(r => r.phase === 'semi' && r.status === 'finished');
  const numHeats = heatRaces.length;

  const heatResultsForDraw = heatRaces.map(race => ({
    heatNumber: race.heatNumber,
    entries: Object.entries(database.raceResults[race.id] || {})
      .filter(([,r]) => r.status === 'OK')
      .map(([entryId,r]) => ({ entryId, position: r.position, finishTimeMs: r.finishTimeMs, status: r.status })),
  }));

  const semiResultsForDraw = semiRaces.map(race => ({
    semiNumber: race.heatNumber,
    entries: Object.entries(database.raceResults[race.id] || {})
      .filter(([,r]) => r.status === 'OK')
      .map(([entryId,r]) => ({ entryId, position: r.position, finishTimeMs: r.finishTimeMs, status: r.status })),
  }));

  let icfFinals = (meetLanes === 9 && (semiRaces.length > 0 || numHeats > 0))
    ? applyICFFinalDraw(semiResultsForDraw, numHeats, heatResultsForDraw, directIds)
    : null;
  if (!icfFinals || !icfFinals.finalA) {
    icfFinals = applyGeneralisedFinalDraw(semiResultsForDraw, meetLanes, directIds, finalsCount);
  }

  if (icfFinals && icfFinals.finalA) {
    const phaseMap = { finalA: 'final', finalB: 'finalB', finalC: 'finalC' };
    let filled = 0;
    ['finalA','finalB','finalC'].slice(0, finalsCount).forEach(key => {
      const lanes = icfFinals[key];
      if (!lanes || Object.keys(lanes).length === 0) return;
      const phase = phaseMap[key];
      const placeholder = (existingFinalRaces || []).find(r => r.phase === phase && r.heatNumber === 1 && r.placeholder);
      if (placeholder) {
        placeholder.lanes = lanes;
        placeholder.placeholder = false;
        placeholder.published = true;
        if (scheduledLabel) placeholder.scheduledLabel = scheduledLabel;
      } else {
        const race = newRace(database, event.id, phase, 1, lanes, scheduledLabel);
        race.published = true;
      }
      filled++;
    });
    event.pendingDirectQualifiers = [];
    return { action: 'created-finals-icf', count: filled, plan: 'ICF-Appendix1' };
  }

  // Fallback: center-out for events not covered by ICF plans
  const phases = ['final', 'finalB', 'finalC'].slice(0, finalsCount);
  const pool = [...rankedPoolIds];
  let filled = 0;
  phases.forEach((phase, i) => {
    const capacity = i === 0 ? meetLanes - directIds.length : meetLanes;
    const group = (i === 0 ? directIds : []).concat(pool.splice(0, Math.max(0, capacity)));
    if (group.length === 0) return;
    fillOrCreateRace(database, existingFinalRaces || [], event, phase, 1, group, meetLanes, scheduledLabel);
    filled++;
  });
  event.pendingDirectQualifiers = [];
  return { action: 'created-finals', count: filled, leftOver: pool.length };
}

/**
 * Call after any race is marked finished. Checks if this completes the
 * 'heat' or 'semi' round for its event, and if so, automatically creates
 * the next round(s) — including splitting into multiple finals (A/B/C)
 * when the field is big enough (ICF 5.1.4). Mutates `database` in place;
 * caller (races.js) is responsible for db.save() afterward.
 *
 * Returns a short summary of what was created, or null if nothing changed
 * (round not complete yet, straight final, or unsupported field size).
 */
function autoAdvance(database, eventId) {
  const event = database.events[eventId];
  if (!event || !event.plan || !event.plan.runnable || event.plan.unsupported) return null;
  if (!event.plan.rounds || event.plan.rounds.length < 3) return null; // straight final — nothing to advance

  const allRaces = Object.values(database.races).filter((r) => r.eventId === eventId);
  const heatRaces = allRaces.filter((r) => r.phase === 'heat');
  const semiRaces = allRaces.filter((r) => r.phase === 'semi');
  const finalRaces = allRaces.filter((r) => r.phase === 'final' || r.phase === 'finalB' || r.phase === 'finalC');
  // "Not yet filled" = no such race exists, or every one that does is
  // still an empty placeholder. Draw time creates placeholder semi/final
  // slots with empty lanes so the printed programme shows the full
  // running order upfront (see programme.js generate()). A placeholder
  // never actually races (nobody's in it), so checking real races'
  // status === 'finished' already naturally excludes any placeholder.
  const semisNotYetFilled = semiRaces.length === 0 || semiRaces.every((r) => r.placeholder);
  const finalsNotYetFilled = finalRaces.length === 0 || finalRaces.every((r) => r.placeholder);
  const plan = event.plan;
  const meet = database.meets[event.meetId];
  const meetLanes = (meet && meet.lanes) || rules.DEFAULT_LANES;

  // --- Heats complete, semis/finals still placeholders (not filled yet) ---
  if (heatRaces.length > 0 && heatRaces.every((r) => r.status === 'finished') && semisNotYetFilled && finalsNotYetFilled) {
    const directIds = [];
    const nonDirect = [];
    heatRaces.forEach((race) => {
      const results = database.raceResults[race.id] || {};
      Object.entries(results).forEach(([entryId, r]) => {
        if (r.status !== 'OK') return;
        const entry = database.entries[entryId];
        if (!entry || entry.status !== 'active') return;
        if (plan.directPerHeat > 0 && r.position <= plan.directPerHeat) directIds.push(entryId);
        else nonDirect.push({ entryId, position: r.position, finishTimeMs: r.finishTimeMs });
      });
    });
    event.pendingDirectQualifiers = directIds; // consumed when Final A is created below

    if (plan.numSemis > 0 && nonDirect.length > 0) {
      const scheduledLabel = computeRestScheduledLabel(database, heatRaces, event.meetId);

      // Try ICF Appendix 1 exact lane draw first (Plans A & B, 2-3 heats)
      const heatResultsForDraw = heatRaces.map(race => ({
        heatNumber: race.heatNumber,
        entries: Object.entries(database.raceResults[race.id] || {})
          .filter(([, r]) => r.status === 'OK')
          .map(([entryId, r]) => ({
            entryId, position: r.position, finishTimeMs: r.finishTimeMs, status: r.status,
          })),
      }));

      let icfDraw = meetLanes === 9
        ? applyICFSemiDraw(heatResultsForDraw, heatRaces.length, event.icfPlanVariant || 'P1')
        : null;
      // Non-9-lane or plan not covered: generalised ICF-principle draw
      if (!icfDraw) {
        const g = applyGeneralisedSemiDraw(heatResultsForDraw, plan.numSemis, meetLanes, plan.directPerHeat || 0);
        if (g && Object.keys(g.semis).length > 0) {
          icfDraw = { semis: g.semis, directToFinalLanes: {} };
          // Override directIds with what the generalised draw computed
          directIds.length = 0;
          g.directToFinalIds.forEach(id => directIds.push(id));
        }
      }

      if (icfDraw) {
        // ICF exact draw available — use pre-determined lane assignments
        let filled = 0;
        Object.entries(icfDraw.semis).forEach(([semiNum, lanes]) => {
          const entryIds = Object.values(lanes).filter(Boolean);
          if (entryIds.length === 0) return;
          const placeholder = semiRaces.find(r => r.phase === 'semi' && r.heatNumber === Number(semiNum) && r.placeholder);
          if (placeholder) {
            placeholder.lanes = lanes;
            placeholder.placeholder = false;
            placeholder.published = true;
            if (scheduledLabel) placeholder.scheduledLabel = scheduledLabel;
          } else {
            const race = newRace(database, event.id, 'semi', Number(semiNum), lanes, scheduledLabel);
            race.published = true;
          }
          filled++;
        });
        // Store direct qualifiers for final creation
        event.pendingDirectQualifiers = directIds;
        return { action: 'created-semis-icf', count: filled, directCount: directIds.length, plan: 'ICF-Appendix1' };
      }

      // Fallback: snake distribution for Plans C-G (4+ heats)
      nonDirect.sort((a, b) => (a.position - b.position) || (a.finishTimeMs - b.finishTimeMs));
      const groups = distributeSnake(nonDirect.map((x) => x.entryId), plan.numSemis);
      let filled = 0;
      groups.forEach((group, i) => {
        if (group.length === 0) return;
        fillOrCreateRace(database, semiRaces, event, 'semi', i + 1, group, meetLanes, scheduledLabel);
        filled++;
      });
      return { action: 'created-semis', count: filled, directCount: directIds.length };
    }

    // No semi round needed (rare: e.g. entire field qualifies direct) —
    // go straight to creating final(s) from the direct qualifiers alone.
    return createFinals(database, event, directIds, [], heatRaces, finalRaces);
  }

  // --- Semis complete (real, filled semis, all finished), finals still placeholders ---
  if (semiRaces.length > 0 && semiRaces.every((r) => r.status === 'finished') && finalsNotYetFilled) {
    const ranked = rankedFinishers(database, semiRaces).map((r) => r.entryId);
    return createFinals(database, event, event.pendingDirectQualifiers || [], ranked, semiRaces, finalRaces);
  }

  return null;
}

// Fill an existing placeholder race in place (keeping its raceNumber and
// any pre-set scheduledLabel history) if one exists for this phase/heat
// number; otherwise fall back to creating a fresh race (e.g. for meets
// drawn before this feature existed).
//
// Either way, this round was reached automatically — no human decision
// in the loop — from an event the office already finalised once. Making
// it wait for a SECOND manual "Finalise" click before it can appear on
// Tower is exactly what caused a completed, weighed heat's semi to be
// genuinely nowhere to be found: not blocked by weigh-in (that had
// passed), just sitting unpublished. Auto-publishing it here doesn't
// skip the weigh-in gate — /active still holds it back until that's
// done — it just removes the redundant extra publish step for a round
// nobody explicitly reviewed to begin with.
function fillOrCreateRace(database, existingRaces, event, phase, heatNumber, entryIds, meetLanes, scheduledLabel) {
  const placeholder = existingRaces.find((r) => r.phase === phase && r.heatNumber === heatNumber && r.placeholder);
  if (placeholder) {
    placeholder.lanes = assignLanes(entryIds, meetLanes);
    placeholder.placeholder = false;
    placeholder.published = true;
    if (scheduledLabel) placeholder.scheduledLabel = scheduledLabel;
    return placeholder;
  }
  const race = newRace(database, event.id, phase, heatNumber, assignLanes(entryIds, meetLanes), scheduledLabel);
  race.published = true;
  return race;
}

module.exports = { autoAdvance, distributeSnake, rankedFinishers };
