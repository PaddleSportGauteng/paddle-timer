// Sprints Trilogy — the shootout engine.
//
// One day, 100m, two lanes (three only to absorb an odd number). Six rounds.
// Nobody is eliminated: every paddler races every round. Handicaps are
// DISTANCE, never time — everyone starts on the same signal and the slower
// paddler is placed a number of buoys up the course.
//
// Rules as agreed with the race office (supersedes the 4 Aug email where
// the two differ):
//   Time Used   fastest of the Round 1 and Round 2 times, 0 means no time
//   Buoys       your Time Used minus the fastest Time Used in your race,
//               one buoy per second, whole numbers, NO cap
//   Round 1     grouped by age category, no handicap, timed
//   Round 2     whole field, age ignored, seeded on the Round 1 time
//   Rounds 3-6  grouped by the previous round's position — the 1sts in one
//               group, the 2nds and 3rds together in another
//   Points      50/45/40/35/30/25/20/15 then 10, by AGE GROUP ONLY, with no
//               separate male and female
//   Rematches   avoided by one adjacent swap where the times still work,
//               otherwise allowed and flagged

const POINTS = [50, 45, 40, 35, 30, 25, 20, 15];
const POINTS_TAIL = 10;

// ── Time Used ─────────────────────────────────────────────────────
// A 0 or a blank is "no time recorded" and is never treated as fast.
function timeUsed(r1, r2) {
  const times = [r1, r2].map(Number).filter((t) => t && t > 0);
  if (!times.length) return null;
  return Math.min(...times);
}

// ── Buoys ─────────────────────────────────────────────────────────
// Handicap for one race: everyone measured against the fastest boat in
// that race. The fastest gets 0 and starts at the line.
function buoysForRace(times) {
  const known = times.filter((t) => t != null && t > 0);
  if (!known.length) return times.map(() => 0);
  const fastest = Math.min(...known);
  return times.map((t) => (t == null || t <= 0 ? 0 : Math.round(t - fastest)));
}

// ── Pairing ───────────────────────────────────────────────────────
// Seed slowest first and pair neighbours, so each race is between the two
// closest times available. An odd count puts three in the LAST race.
function pairBySeed(seeded) {
  const races = [];
  const n = seeded.length;
  if (n === 0) return races;
  if (n === 1) return [[seeded[0]]];
  const oddTail = n % 2 === 1;
  const pairCount = Math.floor(n / 2) - (oddTail ? 1 : 0);
  let i = 0;
  for (let p = 0; p < pairCount; p++) { races.push([seeded[i], seeded[i + 1]]); i += 2; }
  if (oddTail) races.push([seeded[i], seeded[i + 1], seeded[i + 2]]);
  else if (i < n) races.push([seeded[i], seeded[i + 1]]);
  return races;
}

// Have these two raced each other before?
function met(history, a, b) {
  return (history[a] || []).includes(b);
}
function recordMeetings(history, race) {
  race.forEach((p) => {
    history[p] = history[p] || [];
    race.forEach((q) => { if (q !== p && !history[p].includes(q)) history[p].push(q); });
  });
}

// Try to break a rematch by swapping one paddler with the neighbouring
// race. Only accepted if it removes a rematch without creating one.
// Deliberately shallow: a deep reshuffle would trade a close race for a
// novel one, which is the wrong trade in a handicap series.
function relieveRematches(races, history) {
  const isRematch = (r) => r.some((a, i) => r.slice(i + 1).some((b) => met(history, a, b)));
  for (let i = 0; i < races.length - 1; i++) {
    if (!isRematch(races[i])) continue;
    for (let a = 0; a < races[i].length; a++) {
      for (let b = 0; b < races[i + 1].length; b++) {
        const A = races[i].slice(), B = races[i + 1].slice();
        [A[a], B[b]] = [B[b], A[a]];
        if (!isRematch(A) && !isRematch(B)) { races[i] = A; races[i + 1] = B; a = 99; break; }
      }
    }
  }
  return races.map((r) => ({
    lanes: r,
    rematch: r.some((a, i) => r.slice(i + 1).some((b) => met(history, a, b))),
  }));
}

// ── Round 1 — by age category, no handicap ────────────────────────
function drawRound1(paddlers) {
  const byCat = {};
  paddlers.forEach((p) => { (byCat[p.ageCategory] = byCat[p.ageCategory] || []).push(p); });
  const races = [];
  Object.keys(byCat).sort().forEach((cat) => {
    pairBySeed(byCat[cat]).forEach((group) => {
      races.push({
        ageCategory: cat,
        lanes: group.map((p, i) => ({ lane: i + 1, paddlerId: p.id, buoys: 0 })),
        timed: true, rematch: false,
      });
    });
  });
  return races.map((r, i) => ({ ...r, raceNumber: i + 1 }));
}

// ── Round 2 — whole field, seeded on the Round 1 time ─────────────
// Everyone goes through including anyone with no Round 1 time. Those
// without a time are placed without reference to time and must not face
// someone they raced in Round 1.
function drawRound2(paddlers, r1TimeById, history) {
  const timed = paddlers.filter((p) => r1TimeById[p.id] > 0)
    .sort((a, b) => r1TimeById[b.id] - r1TimeById[a.id]); // slowest first
  const untimed = paddlers.filter((p) => !(r1TimeById[p.id] > 0));

  let races = pairBySeed(timed.map((p) => p.id));
  const untimedRaces = pairBySeed(untimed.map((p) => p.id));
  races = races.concat(untimedRaces);
  const built = relieveRematches(races, history);

  return built.map((r, i) => {
    const times = r.lanes.map((id) => r1TimeById[id] || null);
    const b = buoysForRace(times);
    return {
      raceNumber: i + 1, timed: true, rematch: r.rematch,
      lanes: r.lanes.map((id, j) => ({ lane: j + 1, paddlerId: id, buoys: b[j] })),
    };
  });
}

// ── Rounds 3-6 — position against position ────────────────────────
// Group by the previous round's finishing position: the 1sts together,
// the 2nds and 3rds together. A group of one merges into the next group so
// nobody races alone. The slower group races first.
function drawRound(paddlers, prevPositionById, timeUsedById, history) {
  const winners = [], rest = [];
  paddlers.forEach((p) => {
    const pos = prevPositionById[p.id];
    (pos === 1 ? winners : rest).push(p.id);
  });

  let groups = [rest, winners].filter((g) => g.length); // slower group first
  // A group of one merges forward
  for (let i = 0; i < groups.length - 1; i++) {
    if (groups[i].length === 1) { groups[i + 1] = groups[i].concat(groups[i + 1]); groups[i] = []; }
  }
  groups = groups.filter((g) => g.length);

  const out = [];
  groups.forEach((g) => {
    const seeded = g.slice().sort((a, b) => (timeUsedById[b] || 0) - (timeUsedById[a] || 0));
    relieveRematches(pairBySeed(seeded), history).forEach((r) => {
      const b = buoysForRace(r.lanes.map((id) => timeUsedById[id] || null));
      out.push({
        timed: false, rematch: r.rematch,
        lanes: r.lanes.map((id, j) => ({ lane: j + 1, paddlerId: id, buoys: b[j] })),
      });
    });
  });
  return out.map((r, i) => ({ ...r, raceNumber: i + 1 }));
}

// ── Standings ─────────────────────────────────────────────────────
// Bracket score: A or B for the Round 2 result, then W or L for Rounds
// 3-6. An earlier loss costs more. Lowest score wins. Ties break on the
// Round 6 finishing position, then on Time Used.
function pathScore(path) {
  if (!path) return 999999;
  let s = 0;
  if (path[0] === 'B') s += 16;
  [8, 4, 2, 1].forEach((w, i) => { if (path[i + 1] === 'L') s += w; });
  return s;
}

function buildPath(positionsByRound) {
  const r2 = positionsByRound[2];
  if (!r2) return '';
  let path = r2 === 1 ? 'A' : 'B';
  [3, 4, 5, 6].forEach((rd) => {
    const pos = positionsByRound[rd];
    path += pos == null ? '' : (pos === 1 ? 'W' : 'L');
  });
  return path;
}

// Overall order, then points by age group (age only, no gender split).
function standings(paddlers, positionsByRoundById, timeUsedById) {
  const rows = paddlers.map((p) => {
    const byRound = positionsByRoundById[p.id] || {};
    const path = buildPath(byRound);
    return {
      ...p, path,
      score: pathScore(path),
      finalPos: byRound[6] == null ? 99 : byRound[6],
      timeUsed: timeUsedById[p.id] == null ? 9999 : timeUsedById[p.id],
    };
  });
  rows.sort((a, b) => a.score - b.score || a.finalPos - b.finalPos || a.timeUsed - b.timeUsed);
  rows.forEach((r, i) => { r.overallPlace = i + 1; });

  const seen = {};
  rows.forEach((r) => {
    const n = (seen[r.ageCategory] = (seen[r.ageCategory] || 0) + 1);
    r.catPlace = n;
    r.points = n <= POINTS.length ? POINTS[n - 1] : POINTS_TAIL;
  });
  return rows;
}

module.exports = {
  timeUsed, buoysForRace, pairBySeed, drawRound1, drawRound2, drawRound,
  standings, pathScore, buildPath, recordMeetings, met, POINTS, POINTS_TAIL,
};
