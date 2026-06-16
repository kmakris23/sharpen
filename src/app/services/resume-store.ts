// Persists the parsed resume so the user uploads once, not every session.
// Small JSON -> localStorage (same approach as the key). Best-effort; never throws.

import { Injectable } from '@angular/core';
import { type Profile } from '../models/types';

const STORAGE = 'sharpen.resume';

export interface SavedResume {
  profile: Profile;
  name: string; // original file name, for display
}

@Injectable({ providedIn: 'root' })
export class ResumeStore {
  /** Load the saved resume, or null if none/invalid. */
  load(): SavedResume | null {
    try {
      const raw = localStorage.getItem(STORAGE);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as SavedResume;
      // Light validation — ignore anything that isn't a usable profile.
      if (parsed?.profile && Array.isArray(parsed.profile.topics)) return parsed;
      return null;
    } catch {
      return null;
    }
  }

  save(profile: Profile, name: string): void {
    try {
      localStorage.setItem(STORAGE, JSON.stringify({ profile, name }));
    } catch {
      // Storage unavailable — resume just won't persist this session.
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
