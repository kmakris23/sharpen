// Pure scheduling + leveling logic. No Angular, no IndexedDB, no Date/time.
// Resurfacing is QUESTION-COUNT based (SPEC §Scheduler): a topic is due after a
// number of questions, gap scaled by mastery. Levels are DERIVED from mastery.

import {
  type Category,
  type DrillTopic,
  type Level,
  type LevelEstimate,
  type MasteryRow,
  type Mode,
} from '../models/types';

// ---- Tunable constants (SPEC §Leveling & Calibration; revisit after demo) ----
export const MIN_TOTAL = 3; // answers before an OVERALL level appears
export const MIN_CATS = 2; // distinct categories the overall level must span
export const MIN_PER_CAT = 2; // answers in a category before its level appears
export const WEIGHT_CAP = 3; // cap per-topic weight so one drilled topic can't dominate
export const OVERDUE_WEIGHT = 1.5; // how much count-overdue pushes a topic up

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Stable display order: by the plan `order` set at parse time, then topic name as a
 * tiebreak. Rows missing `order` (legacy, pre-order seeds) sort last by name — so
 * the comparator degrades to alphabetical rather than throwing the list around.
 */
export function byPlanOrder(
  a: { order?: number; topic: string },
  b: { order?: number; topic: string },
): number {
  const ao = a.order ?? Number.MAX_SAFE_INTEGER;
  const bo = b.order ?? Number.MAX_SAFE_INTEGER;
  return ao - bo || a.topic.localeCompare(b.topic);
}

/** Distinct categories in plan order: by the earliest (smallest) topic order within each. */
export function orderedCategories(rows: readonly MasteryRow[]): Category[] {
  const minOrder = new Map<Category, number>();
  for (const r of rows) {
    const o = r.order ?? Number.MAX_SAFE_INTEGER;
    const cur = minOrder.get(r.cat);
    if (cur === undefined || o < cur) minOrder.set(r.cat, o);
  }
  return [...minOrder.keys()].sort((a, b) => minOrder.get(a)! - minOrder.get(b)! || a.localeCompare(b));
}

// --- Mastery update --------------------------------------------------------

/**
 * Recency-weighted rolling score + a count-based resurface gap.
 * `questionsAsked` is the running total of answered questions INCLUDING this one.
 */
export function updateMastery(
  prev: MasteryRow | null,
  topic: string,
  cat: Category,
  score: number,
  questionsAsked: number,
): MasteryRow {
  const timesSeen = (prev?.timesSeen ?? 0) + 1;
  const rolling = prev == null ? score : prev.rollingScore * 0.6 + score * 0.4;
  const rollingScore = round1(clamp(rolling, 0, 10));
  // weak -> resurface soon (~2 questions); strong -> later (~10).
  const resurfaceAfterQ = Math.round(2 + (rollingScore / 10) * 8);
  // Subtopics are display-only metadata seeded at parse time; carry them across the
  // upsert so the first answer's row doesn't drop the topic's badges.
  return {
    topic,
    cat,
    rollingScore,
    timesSeen,
    lastAskedAtQ: questionsAsked,
    resurfaceAfterQ,
    ...(prev?.subtopics?.length ? { subtopics: prev.subtopics } : {}),
  };
}

// --- Leveling --------------------------------------------------------------

interface Band {
  level: Level;
  lo: number;
  hi: number;
  hasNext: boolean;
}

// Non-uniform bands (harder to climb at the top). Boundaries belong to the upper band.
const BANDS: readonly Band[] = [
  { level: 1, lo: 0, hi: 3, hasNext: true },
  { level: 2, lo: 3, hi: 5, hasNext: true },
  { level: 3, lo: 5, hi: 7, hasNext: true },
  { level: 4, lo: 7, hi: 8.5, hasNext: true },
  { level: 5, lo: 8.5, hi: 10, hasNext: false },
];

function bandFor(score: number): Band {
  const s = clamp(score, 0, 10);
  return BANDS.find((b) => (b.hasNext ? s >= b.lo && s < b.hi : s >= b.lo)) ?? BANDS[BANDS.length - 1];
}

function aggregate(rows: MasteryRow[]): { score: number; samples: number; cats: number } {
  const seen = rows.filter((r) => r.timesSeen > 0);
  const samples = seen.reduce((a, r) => a + r.timesSeen, 0);
  let weighted = 0;
  let weight = 0;
  for (const r of seen) {
    const w = Math.min(r.timesSeen, WEIGHT_CAP);
    weighted += r.rollingScore * w;
    weight += w;
  }
  const score = weight > 0 ? weighted / weight : 0;
  const cats = new Set(seen.map((r) => r.cat)).size;
  return { score, samples, cats };
}

function estimate(score: number, samples: number, ready: boolean): LevelEstimate {
  if (!ready) {
    return { level: null, numeric: 0, score: round1(score), progressToNext: 0, samples };
  }
  const b = bandFor(score);
  const progressToNext = b.hasNext ? clamp((score - b.lo) / (b.hi - b.lo), 0, 1) : 1;
  const numeric = b.hasNext ? b.level + progressToNext : 5; // keeps numeric within 1.0–5.0
  return {
    level: b.level,
    numeric: round2(numeric),
    score: round1(score),
    progressToNext: round2(progressToNext),
    samples,
  };
}

/** Overall level: appears once >= MIN_TOTAL answers span >= MIN_CATS categories. */
export function computeLevel(rows: MasteryRow[]): LevelEstimate {
  const { score, samples, cats } = aggregate(rows);
  return estimate(score, samples, samples >= MIN_TOTAL && cats >= MIN_CATS);
}

/**
 * Per-category levels, each calibrating independently (>= MIN_PER_CAT answers).
 * Categories are derived from the rows (resume-driven), in plan order (so the panel
 * lists them in the deliberate order the parse produced, stable across reloads).
 */
export function computeCategoryLevels(rows: MasteryRow[]): Record<Category, LevelEstimate> {
  const out: Record<Category, LevelEstimate> = {};
  for (const cat of orderedCategories(rows)) {
    const inCat = rows.filter((r) => r.cat === cat);
    const { score, samples } = aggregate(inCat);
    out[cat] = estimate(score, samples, samples >= MIN_PER_CAT);
  }
  return out;
}

// --- Topic selection -------------------------------------------------------

/** Whether the overall level is still calibrating (drives coverage-first picks). */
export function isCalibrating(mastery: MasteryRow[]): boolean {
  return computeLevel(mastery).level === null;
}

/**
 * Pick the next topic. While calibrating, spread across categories for coverage;
 * once calibrated, favor weakness + count-overdue + a little randomness.
 * `rng` is injectable so tests can be deterministic.
 */
export function pickNextTopic(
  mastery: MasteryRow[],
  all: readonly DrillTopic[],
  mode: Mode,
  questionsAsked: number,
  rng: () => number = Math.random,
): DrillTopic {
  const byTopic = new Map(mastery.map((r) => [r.topic, r] as const));
  // A row only counts as "seen" once it has an answer — seeded plan rows (timesSeen
  // 0, created at parse time so the panel can show topics) are still effectively unseen.
  const seenRow = (topic: string): MasteryRow | undefined => {
    const m = byTopic.get(topic);
    return m && m.timesSeen > 0 ? m : undefined;
  };

  if (isCalibrating(mastery)) {
    // Coverage: the category with the fewest answers, then an unseen topic in it.
    const answersByCat = new Map<Category, number>();
    for (const r of mastery) answersByCat.set(r.cat, (answersByCat.get(r.cat) ?? 0) + r.timesSeen);
    const cats = [...new Set(all.map((t) => t.cat))]; // first-appearance order (stable)
    cats.sort((a, b) => (answersByCat.get(a) ?? 0) - (answersByCat.get(b) ?? 0));
    const inCat = all.filter((t) => t.cat === cats[0]);
    const unseen = inCat.find((t) => !seenRow(t.topic));
    if (unseen) return unseen;
    return [...inCat].sort(
      (a, b) => (seenRow(a.topic)?.rollingScore ?? 0) - (seenRow(b.topic)?.rollingScore ?? 0),
    )[0];
  }

  const weaknessWeight = mode === 'improve' ? 2.2 : 1;
  let best: DrillTopic | null = null;
  let bestPriority = -Infinity;
  for (const t of all) {
    const m = seenRow(t.topic);
    const score = m ? m.rollingScore : 0; // unseen = weakest
    const overdueQ = m ? Math.max(0, questionsAsked - m.lastAskedAtQ - m.resurfaceAfterQ) : 100;
    const priority = (10 - score) * weaknessWeight + overdueQ * OVERDUE_WEIGHT + rng() * 2;
    if (priority > bestPriority) {
      bestPriority = priority;
      best = t;
    }
  }
  return best ?? all[0];
}
