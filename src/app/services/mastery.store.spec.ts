import 'fake-indexeddb/auto';
import { type MasteryRow } from '../models/types';
import { MasteryStore } from './mastery.store';

const sample: MasteryRow = {
  topic: 'Angular: change detection',
  cat: 'frontend',
  rollingScore: 7,
  timesSeen: 1,
  lastAskedAtQ: 1,
  resurfaceAfterQ: 6,
};

describe('MasteryStore', () => {
  it('updates the rows signal and persists (put -> load on a fresh instance)', async () => {
    const store = new MasteryStore();
    await store.put(sample);
    expect(store.rows()).toContainEqual(sample); // signal updated immediately

    const fresh = new MasteryStore();
    expect(await fresh.load()).toContainEqual(sample); // persisted across instances
    expect(fresh.rows()).toContainEqual(sample);
  });

  it('upserts by topic (no duplicate rows)', async () => {
    const store = new MasteryStore();
    await store.put(sample);
    await store.put({ ...sample, rollingScore: 9, timesSeen: 2 });
    const mine = store.rows().filter((r) => r.topic === sample.topic);
    expect(mine.length).toBe(1);
    expect(mine[0].rollingScore).toBe(9);
  });

  it('seeds plan rows for missing topics without clobbering existing progress', async () => {
    const store = new MasteryStore();
    await store.put(sample); // existing progress on one topic
    await store.seed([
      { topic: sample.topic, cat: 'frontend' }, // already present -> untouched
      { topic: '.NET: DI lifetimes', cat: 'backend' }, // new -> seeded at timesSeen 0
    ]);
    const rows = store.rows();
    expect(rows.find((r) => r.topic === sample.topic)?.rollingScore).toBe(7); // preserved
    const seeded = rows.find((r) => r.topic === '.NET: DI lifetimes');
    expect(seeded).toMatchObject({ cat: 'backend', timesSeen: 0, rollingScore: 0 });
    expect(await new MasteryStore().load()).toContainEqual(seeded!); // persisted
  });

  it('carries subtopics from the plan onto seeded rows (for badge display)', async () => {
    const store = new MasteryStore();
    await store.seed([
      { topic: 'Angular', cat: 'frontend', subtopics: ['SignalR', 'RxJS'] },
      { topic: 'Go', cat: 'backend' }, // none -> no subtopics field
    ]);
    expect(store.rows().find((r) => r.topic === 'Angular')?.subtopics).toEqual(['SignalR', 'RxJS']);
    expect(store.rows().find((r) => r.topic === 'Go')).not.toHaveProperty('subtopics');
  });

  it('clear() wipes the signal and the store', async () => {
    const store = new MasteryStore();
    await store.put(sample);
    await store.clear();
    expect(store.rows()).toEqual([]);
    expect(await new MasteryStore().load()).toEqual([]); // gone from storage too
  });

  it('swallows a storage failure (no throw) when IndexedDB is unavailable', async () => {
    const original = globalThis.indexedDB;
    // @ts-expect-error — simulate unavailable IndexedDB
    globalThis.indexedDB = undefined;
    try {
      const store = new MasteryStore();
      await expect(store.put(sample)).resolves.toBeUndefined();
      await expect(store.load()).resolves.toEqual([]);
    } finally {
      globalThis.indexedDB = original;
    }
  });
});
