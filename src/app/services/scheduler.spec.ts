import { type Category, type DrillTopic, type MasteryRow } from '../models/types';
import {
  byPlanOrder,
  computeCategoryLevels,
  computeLevel,
  isCalibrating,
  MIN_PER_CAT,
  orderedCategories,
  pickNextTopic,
  updateMastery,
} from './scheduler';

// A resume-derived topic set (topics/categories are now resume-driven, not fixed).
const DRILL: readonly DrillTopic[] = [
  { topic: 'Angular: change detection', cat: 'frontend' },
  { topic: 'Angular: RxJS operators', cat: 'frontend' },
  { topic: '.NET: async/await internals', cat: 'backend' },
  { topic: '.NET: DI lifetimes', cat: 'backend' },
  { topic: 'Architecture: multi-tenancy', cat: 'architecture' },
];

function row(topic: string, cat: Category, rollingScore: number, timesSeen = 1): MasteryRow {
  return { topic, cat, rollingScore, timesSeen, lastAskedAtQ: 0, resurfaceAfterQ: 5 };
}

describe('updateMastery', () => {
  it('seeds rolling score from the first answer', () => {
    const m = updateMastery(null, 'Angular: change detection', 'frontend', 7, 1);
    expect(m.rollingScore).toBe(7);
    expect(m.timesSeen).toBe(1);
    expect(m.lastAskedAtQ).toBe(1);
  });

  it('recency-weights subsequent answers (prev*0.6 + score*0.4)', () => {
    const prev = updateMastery(null, 't', 'frontend', 5, 1); // 5
    const next = updateMastery(prev, 't', 'frontend', 10, 2); // 5*0.6 + 10*0.4 = 7
    expect(next.rollingScore).toBe(7);
    expect(next.timesSeen).toBe(2);
    expect(next.lastAskedAtQ).toBe(2);
  });

  it('carries subtopics from the previous (seeded) row across the upsert', () => {
    const seeded: MasteryRow = {
      topic: 'Angular', cat: 'frontend', rollingScore: 0, timesSeen: 0,
      lastAskedAtQ: 0, resurfaceAfterQ: 0, subtopics: ['SignalR', 'RxJS'],
    };
    const first = updateMastery(seeded, 'Angular', 'frontend', 8, 1);
    expect(first.subtopics).toEqual(['SignalR', 'RxJS']);
    // A seeded row (timesSeen 0) carries no real prior, so the first answer seeds the
    // score outright (8) rather than blending against the placeholder 0 (which gave 3.2).
    expect(first.rollingScore).toBe(8);
    // No prior subtopics -> field stays absent.
    expect(updateMastery(null, 'Go', 'backend', 8, 1)).not.toHaveProperty('subtopics');
  });

  it('resurfaces weak topics sooner than strong topics (gap grows with mastery)', () => {
    const weak = updateMastery(null, 't', 'frontend', 0, 1);
    const strong = updateMastery(null, 't', 'frontend', 10, 1);
    expect(weak.resurfaceAfterQ).toBeLessThan(strong.resurfaceAfterQ);
    expect(weak.resurfaceAfterQ).toBe(2); // round(2 + 0)
    expect(strong.resurfaceAfterQ).toBe(10); // round(2 + 8)
  });
});

describe('computeLevel', () => {
  it('returns null while under the calibration threshold', () => {
    expect(computeLevel([]).level).toBeNull();
    expect(computeLevel([row('a', 'frontend', 6, 2)]).level).toBeNull(); // 1 category
  });

  it('appears once enough answers span >= 2 categories', () => {
    const rows = [row('a', 'frontend', 6, 2), row('b', 'backend', 6, 1)];
    const est = computeLevel(rows); // 3 answers, 2 cats, score 6 -> Senior(3)
    expect(est.level).toBe(3);
    expect(est.score).toBe(6);
  });

  it('maps scores to the right band with progressToNext', () => {
    const lvl = (s: number) =>
      computeLevel([row('a', 'frontend', s, 2), row('b', 'backend', s, 1)]).level;
    expect(lvl(2)).toBe(1); // Junior
    expect(lvl(4)).toBe(2); // Mid
    expect(lvl(6)).toBe(3); // Senior
    expect(lvl(8)).toBe(4); // Staff
    expect(lvl(9.5)).toBe(5); // Principal
    // score 6 sits halfway through Senior band [5,7) -> 0.5 to Staff
    expect(computeLevel([row('a', 'frontend', 6, 2), row('b', 'backend', 6, 1)]).progressToNext).toBe(
      0.5,
    );
  });

  it('rises monotonically as scores climb', () => {
    const at = (s: number) =>
      computeLevel([row('a', 'frontend', s, 2), row('b', 'backend', s, 1)]).numeric;
    expect(at(2)).toBeLessThan(at(5));
    expect(at(5)).toBeLessThan(at(8));
    expect(at(8)).toBeLessThan(at(9.5));
  });
});

describe('computeCategoryLevels', () => {
  it('calibrates each category independently', () => {
    const rows = [row('a', 'frontend', 7, MIN_PER_CAT), row('b', 'backend', 4, 1)];
    const levels = computeCategoryLevels(rows);
    expect(levels['frontend'].level).not.toBeNull(); // 2 answers -> ready
    expect(levels['backend'].level).toBeNull(); // 1 answer -> calibrating
    expect(levels['architecture']).toBeUndefined(); // no rows -> category absent
  });
});

describe('plan order (display ordering)', () => {
  // Rows as IndexedDB returns them: sorted alphabetically by topic key, NOT plan order.
  const reloaded: MasteryRow[] = [
    { ...row('.NET: DI lifetimes', 'backend', 5), order: 2 },
    { ...row('Angular: change detection', 'frontend', 5), order: 0 },
    { ...row('Architecture: multi-tenancy', 'architecture', 5), order: 4 },
    { ...row('Angular: RxJS operators', 'frontend', 5), order: 1 },
    { ...row('.NET: async/await internals', 'backend', 5), order: 3 },
  ];

  it('byPlanOrder restores the generated order from scrambled rows', () => {
    const ordered = [...reloaded].sort(byPlanOrder).map((r) => r.order);
    expect(ordered).toEqual([0, 1, 2, 3, 4]); // back in plan order
  });

  it('byPlanOrder keeps same-category topics contiguous', () => {
    const cats = [...reloaded].sort(byPlanOrder).map((r) => r.cat);
    expect(cats).toEqual(['frontend', 'frontend', 'backend', 'backend', 'architecture']);
  });

  it('byPlanOrder degrades to alphabetical when order is missing', () => {
    const noOrder = [row('zebra', 'x', 5), row('alpha', 'x', 5)];
    expect([...noOrder].sort(byPlanOrder).map((r) => r.topic)).toEqual(['alpha', 'zebra']);
  });

  it('orderedCategories lists categories by their earliest topic', () => {
    expect(orderedCategories(reloaded)).toEqual(['frontend', 'backend', 'architecture']);
  });

  it('computeCategoryLevels preserves plan order in its key order', () => {
    expect(Object.keys(computeCategoryLevels(reloaded))).toEqual([
      'frontend',
      'backend',
      'architecture',
    ]);
  });
});

describe('pickNextTopic — calibration coverage', () => {
  it('is calibrating with no data and picks an unseen topic', () => {
    expect(isCalibrating([])).toBe(true);
    const picked = pickNextTopic([], DRILL, 'improve', 0, () => 0);
    expect(DRILL.some((t) => t.topic === picked.topic)).toBe(true);
  });

  it('spreads to the least-covered category while calibrating', () => {
    // frontend has answers, backend + architecture have none -> pick a non-frontend topic.
    const mastery = [row('Angular: change detection', 'frontend', 8, 2)];
    const picked = pickNextTopic(mastery, DRILL, 'improve', 2, () => 0);
    expect(picked.cat).not.toBe('frontend');
  });

  it('treats seeded rows (timesSeen 0) as unseen, not answered', () => {
    // 'Angular: change detection' is seeded but never answered; backend has a real answer.
    const mastery = [
      row('.NET: DI lifetimes', 'backend', 8, 2),
      { topic: 'Angular: change detection', cat: 'frontend', rollingScore: 0, timesSeen: 0, lastAskedAtQ: 0, resurfaceAfterQ: 0 },
    ];
    const picked = pickNextTopic(mastery, DRILL, 'improve', 2, () => 0);
    // Coverage goes to the un-answered category, and the seeded topic is eligible as unseen.
    expect(picked.topic).toBe('Angular: change detection');
  });
});

describe('pickNextTopic — calibrated', () => {
  // A calibrated mastery set (>=3 answers, 2 cats) where one topic is clearly weakest.
  const base: MasteryRow[] = [
    row('Angular: change detection', 'frontend', 9, 3),
    row('.NET: DI lifetimes', 'backend', 9, 3),
    { topic: '.NET: async/await internals', cat: 'backend', rollingScore: 1, timesSeen: 2, lastAskedAtQ: 1, resurfaceAfterQ: 2 },
  ];

  it('favors the weakest topic (randomness disabled)', () => {
    expect(isCalibrating(base)).toBe(false);
    const picked = pickNextTopic(base, DRILL, 'improve', 8, () => 0);
    // weakest seen topic, or an unseen one (score 0) — both beat the strong topics.
    const m = base.find((r) => r.topic === picked.topic);
    expect(m?.rollingScore ?? 0).toBeLessThan(5);
  });
});
