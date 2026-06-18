import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { vi } from 'vitest';
import { type DrillTopic, type MasteryRow, Phase, type Profile, type ScoreResult } from '../models/types';
import { DrillSession } from './drill-session';
import { LlmService } from './llm.service';
import { MasteryStore } from './mastery.store';
import { ResumeStore, type SavedResume } from './resume-store';

// Stand-in for a resume-derived topic set (topics are no longer a fixed taxonomy).
const FIXTURE_TOPICS: readonly DrillTopic[] = [
  { topic: 'Angular: change detection', cat: 'frontend' },
  { topic: '.NET: DI lifetimes', cat: 'backend' },
  { topic: 'Architecture: multi-tenancy', cat: 'architecture' },
];

class FakeLlm {
  hasKeyValue = true;
  parseThrows = false;
  score: ScoreResult = { score: 7, strengths: ['clear'], weaknesses: [], articulationNote: 'x', oneLiner: '', termsThatScore: [], teaching: null };
  async parseResume(): Promise<Profile> {
    if (this.parseThrows) throw new Error('Unsupported file');
    return { summary: 's', topics: FIXTURE_TOPICS.map((t) => ({ ...t })), resumeLevel: 3 };
  }
  async generateQuestion(): Promise<string> {
    return 'What is X?';
  }
  async scoreAnswer(): Promise<ScoreResult> {
    return this.score;
  }
  key = () => 'k';
  hasKey = () => this.hasKeyValue;
  setKey(): void {}
}

class FakeStore {
  private readonly _rows = signal<MasteryRow[]>([]);
  rows = this._rows.asReadonly();
  cleared = false;
  async load(): Promise<MasteryRow[]> {
    return this._rows();
  }
  async seed(topics: readonly DrillTopic[]): Promise<void> {
    const have = new Set(this._rows().map((r) => r.topic));
    const fresh = topics
      .filter((t) => !have.has(t.topic))
      .map((t) => ({ topic: t.topic, cat: t.cat, rollingScore: 0, timesSeen: 0, lastAskedAtQ: 0, resurfaceAfterQ: 0 }));
    this._rows.update((rows) => [...rows, ...fresh]);
  }
  async clear(): Promise<void> {
    this.cleared = true;
    this._rows.set([]);
  }
  async put(row: MasteryRow): Promise<void> {
    this._rows.update((rows) => {
      const i = rows.findIndex((r) => r.topic === row.topic);
      if (i === -1) return [...rows, row];
      const c = rows.slice();
      c[i] = row;
      return c;
    });
  }
}

class FakeRouter {
  calls: string[] = [];
  navigate(commands: string[]): Promise<boolean> {
    this.calls.push(commands.join('/'));
    return Promise.resolve(true);
  }
}

class FakeResume {
  saved: SavedResume | null = null;
  load(): SavedResume | null {
    return this.saved;
  }
  save(profile: SavedResume['profile'], name: string): void {
    this.saved = { profile, name };
  }
  clear(): void {
    this.saved = null;
  }
}

describe('DrillSession', () => {
  let llm: FakeLlm;
  let router: FakeRouter;
  let resume: FakeResume;
  let store: FakeStore;

  beforeEach(() => localStorage.clear()); // mode persists to localStorage

  function session() {
    llm = new FakeLlm();
    router = new FakeRouter();
    resume = new FakeResume();
    store = new FakeStore();
    TestBed.configureTestingModule({
      providers: [
        DrillSession,
        { provide: LlmService, useValue: llm },
        { provide: MasteryStore, useValue: store },
        { provide: ResumeStore, useValue: resume },
        { provide: Router, useValue: router },
      ],
    });
    return TestBed.inject(DrillSession);
  }

  it('runs the loop and navigates through the real screens', async () => {
    const s = session();
    expect(s.phase()).toBe(Phase.Landing);

    await s.onFileSelected(new File(['cv'], 'r.pdf'));
    expect(s.phase()).toBe(Phase.Mode);
    expect(s.hasProfile()).toBe(true);

    await s.onModePicked('improve');
    expect(s.phase()).toBe(Phase.Ready);
    expect(s.canDrill()).toBe(true);

    await s.onStart();
    expect(s.phase()).toBe(Phase.Answering);
    expect(s.currentQuestion()).toBe('What is X?');
    expect(s.inputEnabled()).toBe(true);

    await s.onAnswer('my answer');
    expect(s.phase()).toBe(Phase.Feedback);
    expect(s.inputEnabled()).toBe(false); // no double-submit
    expect(s.messages().some((m) => m.role === 'feedback' && m.result?.score === 7)).toBe(true);

    await s.onNext();
    expect(s.phase()).toBe(Phase.Answering);

    // Each question gets its own URL: Q1 -> /drill/1, Q2 -> /drill/2.
    expect(router.calls).toEqual(['/mode', '/ready', '/drill/1', '/drill/2']);
  });

  it('restores an in-flight drill on reload so progress is not lost', async () => {
    const s = session();
    await s.onFileSelected(new File(['cv'], 'jane.pdf'));
    await s.onModePicked('improve');
    await s.onStart(); // Q1 asked -> snapshot at Answering
    await s.onAnswer('my answer'); // Q1 scored -> snapshot at Feedback
    expect(s.questionNumber()).toBe(1);
    expect(s.phase()).toBe(Phase.Feedback);

    // Simulate a reload: a brand-new session with the same persisted resume/mode/drill.
    // (localStorage survives the TestBed reset, mirroring a real page refresh.)
    TestBed.resetTestingModule();
    const reloaded = session();
    resume.saved = { profile: { summary: 's', topics: FIXTURE_TOPICS.map((t) => ({ ...t })), resumeLevel: 3 }, name: 'jane.pdf' };
    reloaded.init();

    expect(reloaded.questionNumber()).toBe(1); // back on the same question
    expect(reloaded.phase()).toBe(Phase.Feedback); // at the same stable phase
    expect(reloaded.currentQuestion()).toBe('What is X?');
    expect(reloaded.messages().some((m) => m.role === 'feedback')).toBe(true); // transcript restored
  });

  it('counts questions per drill session and resets the counter on resetProgress', async () => {
    const s = session();
    expect(s.questionNumber()).toBe(0); // nothing asked yet

    await s.onFileSelected(new File(['cv'], 'jane.pdf'));
    await s.onModePicked('improve');

    await s.onStart(); // Q1
    expect(s.questionNumber()).toBe(1);

    await s.onAnswer('a1');
    await s.onNext(); // Q2
    expect(s.questionNumber()).toBe(2);

    await s.resetProgress();
    expect(s.questionNumber()).toBe(0); // progress wiped
  });

  it('shows only the current question cycle (one at a time), not the whole transcript', async () => {
    const s = session();
    await s.onFileSelected(new File(['cv'], 'jane.pdf'));
    await s.onModePicked('improve');

    await s.onStart(); // first question
    await s.onAnswer('answer one'); // -> feedback for Q1
    const firstKey = s.cycleKey();
    await s.onNext(); // second question

    // The full transcript keeps both cycles; the view shows only the latest.
    expect(s.messages().length).toBeGreaterThan(s.currentMessages().length);
    expect(s.currentMessages()[0]?.role).toBe('topic');
    expect(s.currentMessages().some((m) => m.text === 'answer one')).toBe(false);
    expect(s.cycleKey()).not.toBe(firstKey); // key advances per question
  });

  it('blocks upload without a key (stays on LANDING, no navigation)', async () => {
    const s = session();
    llm.hasKeyValue = false;
    await s.onFileSelected(new File(['cv'], 'r.pdf'));
    expect(s.phase()).toBe(Phase.Landing);
    expect(s.error()).toContain('key');
    expect(router.calls).toEqual([]);
  });

  it('recovers to LANDING with a message when parsing fails (no navigation)', async () => {
    const s = session();
    llm.parseThrows = true;
    await s.onFileSelected(new File(['x'], 'bad.zip'));
    expect(s.phase()).toBe(Phase.Landing);
    expect(s.error()).toContain('Unsupported file');
    expect(router.calls).toEqual([]);
  });

  it('persists the parsed resume so it is remembered next time', async () => {
    const s = session();
    await s.onFileSelected(new File(['cv'], 'jane.pdf'));
    expect(resume.saved?.name).toBe('jane.pdf');
    expect(s.resumeName()).toBe('jane.pdf');
  });

  it('loads a saved resume on init (skips re-upload)', () => {
    const s = session();
    resume.saved = { profile: { summary: 'saved', topics: [], resumeLevel: 2 }, name: 'old.pdf' };
    s.init();
    expect(s.hasProfile()).toBe(true);
    expect(s.resumeName()).toBe('old.pdf');
  });

  it('restores the picked mode on init so /ready survives a reload', () => {
    const s = session();
    // Simulate a prior session that persisted a resume + mode, then a reload.
    resume.saved = { profile: { summary: 's', topics: FIXTURE_TOPICS.map((t) => ({ ...t })), resumeLevel: 3 }, name: 'jane.pdf' };
    localStorage.setItem('sharpen.mode', 'improve');
    s.init();
    expect(s.mode()).toBe('improve');
    expect(s.canDrill()).toBe(true); // guard for /ready now passes
  });

  it('seeds the parsed topics into the store so the panel shows them before drilling', async () => {
    const s = session();
    await s.onFileSelected(new File(['cv'], 'jane.pdf'));
    expect(store.rows().map((r) => r.topic).sort()).toEqual(
      FIXTURE_TOPICS.map((t) => t.topic).sort(),
    );
    expect(store.rows().every((r) => r.timesSeen === 0)).toBe(true); // seeded, not yet answered
  });

  it('resetAll wipes the store, resume, mode, key and returns to LANDING', async () => {
    const s = session();
    const clearKey = vi.spyOn(llm, 'setKey');
    await s.onFileSelected(new File(['cv'], 'jane.pdf'));
    await s.onModePicked('improve');

    await s.resetAll();

    expect(store.cleared).toBe(true);
    expect(store.rows()).toEqual([]);
    expect(resume.saved).toBeNull();
    expect(localStorage.getItem('sharpen.mode')).toBeNull();
    expect(clearKey).toHaveBeenCalledWith('');
    expect(s.hasProfile()).toBe(false);
    expect(s.mode()).toBeNull();
    expect(s.phase()).toBe(Phase.Landing);
    expect(router.calls).toContain('/');
  });

  it('resetProgress clears mastery + reseeds topics but keeps the resume, mode and key', async () => {
    const s = session();
    const setKey = vi.spyOn(llm, 'setKey');
    await s.onFileSelected(new File(['cv'], 'jane.pdf'));
    await s.onModePicked('improve');
    await s.onStart();
    await s.onAnswer('an answer'); // creates real progress on one topic

    await s.resetProgress();

    expect(store.cleared).toBe(true);
    expect(store.rows().length).toBe(FIXTURE_TOPICS.length); // topics reseeded
    expect(store.rows().every((r) => r.timesSeen === 0)).toBe(true); // progress gone
    expect(resume.saved?.name).toBe('jane.pdf'); // resume kept
    expect(s.hasProfile()).toBe(true);
    expect(s.mode()).toBe('improve'); // mode kept
    expect(setKey).not.toHaveBeenCalledWith(''); // key NOT wiped
    expect(s.messages()).toEqual([]); // conversation cleared
    expect(router.calls).toContain('/ready'); // clean restart point
  });

  it('clearResume forgets the persisted mode too', async () => {
    const s = session();
    await s.onFileSelected(new File(['cv'], 'jane.pdf'));
    await s.onModePicked('interview');
    await s.clearResume();
    expect(localStorage.getItem('sharpen.mode')).toBeNull();
  });

  it('continueWithSavedResume goes straight to /mode', async () => {
    const s = session();
    resume.saved = { profile: { summary: 'saved', topics: [], resumeLevel: 2 }, name: 'old.pdf' };
    s.init();
    await s.continueWithSavedResume();
    expect(s.phase()).toBe(Phase.Mode);
    expect(router.calls).toEqual(['/mode']);
  });

  it('clearResume forgets the resume and returns to LANDING', async () => {
    const s = session();
    await s.onFileSelected(new File(['cv'], 'jane.pdf'));
    await s.clearResume();
    expect(resume.saved).toBeNull();
    expect(s.hasProfile()).toBe(false);
    expect(s.phase()).toBe(Phase.Landing);
    expect(router.calls).toContain('/');
  });

  it('clearResume drops the old plan so a re-upload has no leftover topics', async () => {
    const s = session();
    // First resume: topics seeded into the store.
    await s.onFileSelected(new File(['cv'], 'old.pdf'));
    expect(store.rows().length).toBe(FIXTURE_TOPICS.length);

    await s.clearResume(); // "Replace résumé"
    expect(store.cleared).toBe(true);
    expect(store.rows()).toEqual([]); // old topics gone — no stacking on re-upload

    // Second resume seeds a clean set, not old + new.
    await s.onFileSelected(new File(['cv'], 'new.pdf'));
    expect(store.rows().length).toBe(FIXTURE_TOPICS.length);
  });
});
