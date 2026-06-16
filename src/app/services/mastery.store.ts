// IndexedDB persistence + reactive state for MasteryRow. Best-effort: storage
// failures NEVER throw to the UI. The `rows` signal is the single source of truth
// the mastery panel reads from; persistence is a side effect.
// SWAP POINT 3: swap the IDB bodies for a thin proxy -> Postgres later.

import { Injectable, signal } from '@angular/core';
import { type DrillTopic, type MasteryRow } from '../models/types';

const DB_NAME = 'sharpen';
const STORE = 'mastery';

@Injectable({ providedIn: 'root' })
export class MasteryStore {
  private readonly dbPromise = this.open();
  private readonly _rows = signal<MasteryRow[]>([]);

  /** Live mastery state (read by the mastery panel). */
  readonly rows = this._rows.asReadonly();

  /** Read all rows into the signal on app init. Returns [] on any failure. */
  async load(): Promise<MasteryRow[]> {
    const rows = await this.readAll();
    this._rows.set(rows);
    return rows;
  }

  /**
   * Seed plan rows for a freshly parsed resume so the panel can show its topics +
   * categories before any question is answered. Adds only topics not already present
   * (never clobbers existing progress). Seeded rows have `timesSeen: 0`, so they don't
   * count toward levels and the scheduler still treats them as unseen.
   */
  async seed(topics: readonly DrillTopic[]): Promise<void> {
    const have = new Set(this._rows().map((r) => r.topic));
    const fresh: MasteryRow[] = topics
      .filter((t) => !have.has(t.topic))
      .map((t) => ({
        topic: t.topic,
        cat: t.cat,
        rollingScore: 0,
        timesSeen: 0,
        lastAskedAtQ: 0,
        resurfaceAfterQ: 0,
        order: t.order, // keep the plan order so the panel renders topics/categories in generated order
        ...(t.subtopics?.length ? { subtopics: t.subtopics } : {}), // carry badges for display
      }));
    if (!fresh.length) return;
    this._rows.update((rows) => [...rows, ...fresh]);
    await Promise.all(fresh.map((r) => this.write(r)));
  }

  /** Wipe all mastery: reset the signal immediately, then clear the store. */
  async clear(): Promise<void> {
    this._rows.set([]);
    const db = await this.dbPromise;
    if (!db) return;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  /** Upsert one row: update the signal immediately, then persist best-effort. */
  async put(row: MasteryRow): Promise<void> {
    this._rows.update((rows) => {
      const i = rows.findIndex((r) => r.topic === row.topic);
      if (i === -1) return [...rows, row];
      const copy = rows.slice();
      copy[i] = row;
      return copy;
    });
    await this.write(row);
  }

  private open(): Promise<IDBDatabase | null> {
    return new Promise((resolve) => {
      try {
        const req = globalThis.indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) {
            db.createObjectStore(STORE, { keyPath: 'topic' });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null); // IndexedDB unavailable (private mode, no global, etc.)
      }
    });
  }

  private async readAll(): Promise<MasteryRow[]> {
    const db = await this.dbPromise;
    if (!db) return [];
    return new Promise((resolve) => {
      try {
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
        req.onsuccess = () => resolve(req.result as MasteryRow[]);
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  }

  private async write(row: MasteryRow): Promise<void> {
    const db = await this.dbPromise;
    if (!db) return;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(row);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
  }
}
