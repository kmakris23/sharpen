// Persists the IN-FLIGHT drill so a reload never loses progress. Mastery already
// persists separately (MasteryStore); this captures the transcript + which question
// you're on so the exact screen comes back. Small JSON -> localStorage, same
// best-effort approach as ResumeStore; never throws.
//
// Snapshots are only ever written at STABLE phases (Answering = question shown,
// Feedback = answer scored). The transient phases (asking/scoring) are mid-API-call
// and are never persisted, so restore is a pure render — it never resumes a request.

import { Injectable } from '@angular/core';
import { type ChatMessage, type DrillTopic, Phase } from '../models/types';

const STORAGE = 'sharpen.drill';

// Only these two phases are ever persisted (see module note). Restore rejects anything else.
const STABLE_PHASES: ReadonlySet<Phase> = new Set([Phase.Answering, Phase.Feedback]);

export interface DrillSnapshot {
  messages: ChatMessage[]; // full transcript (currentMessages slices the latest cycle)
  currentTopic: DrillTopic | null;
  currentQuestion: string;
  questionNumber: number; // 1-based index of the question on screen
  phase: Phase; // Answering or Feedback
  askedTexts: string[]; // de-dupe history for question generation
}

@Injectable({ providedIn: 'root' })
export class DrillStore {
  /** Load the in-flight drill, or null if none/invalid/at a non-restorable phase. */
  load(): DrillSnapshot | null {
    try {
      const raw = localStorage.getItem(STORAGE);
      if (!raw) return null;
      const s = JSON.parse(raw) as DrillSnapshot;
      // Light validation: must have a transcript and rest at a stable, renderable phase.
      if (!Array.isArray(s?.messages) || !STABLE_PHASES.has(s.phase) || !(s.questionNumber > 0)) {
        return null;
      }
      return s;
    } catch {
      return null;
    }
  }

  save(snapshot: DrillSnapshot): void {
    try {
      localStorage.setItem(STORAGE, JSON.stringify(snapshot));
    } catch {
      // Storage unavailable/full — the drill just won't survive this reload.
    }
  }

  clear(): void {
    try {
      localStorage.removeItem(STORAGE);
    } catch {
      /* ignore */
    }
  }
}
