import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { type ChatMessage, type DrillTopic, type Mode, Phase, type Profile } from '../models/types';
import { ALLOWED_NEXT } from '../drill/phase-machine';
import { DrillStore } from './drill-store';
import { LlmService } from './llm.service';
import { MasteryStore } from './mastery.store';
import { ResumeStore } from './resume-store';
import { pickNextTopic, updateMastery } from './scheduler';

// Mode persists alongside the resume so a reload keeps you on /mode or /ready
// instead of bouncing to LANDING. The in-flight drill itself persists via DrillStore,
// so a reload restores the exact /drill/:n screen (see init -> restoreDrill).
const MODE_STORAGE = 'sharpen.mode';

// Holds the drill session state + orchestration. Lives outside the routed page
// components (which are created/destroyed on navigation) so they all share one source
// of truth. Navigates between the "real" screens (/, /mode, /ready) and a per-question
// /drill/:n URL; the transient phases (parsing/asking/scoring/feedback) play out inside
// the drill page via the `phase` signal. Mastery persists in MasteryStore; the in-flight
// drill (transcript + current question) persists in DrillStore for reload recovery.
@Injectable({ providedIn: 'root' })
export class DrillSession {
  private readonly llm = inject(LlmService);
  private readonly store = inject(MasteryStore);
  private readonly resume = inject(ResumeStore);
  private readonly drill = inject(DrillStore);
  private readonly router = inject(Router);
  private nextId = 0;
  private readonly askedTexts: string[] = [];

  readonly phase = signal<Phase>(Phase.Landing);
  readonly mode = signal<Mode | null>(null);
  readonly profile = signal<Profile | null>(null);
  readonly resumeName = signal<string>(''); // display name of the loaded resume
  readonly messages = signal<ChatMessage[]>([]);
  readonly currentTopic = signal<DrillTopic | null>(null);
  readonly currentQuestion = signal<string>('');
  // 1-based index of the question currently being drilled THIS session (0 before the
  // first). The drill is open-ended; this is just a progress counter, not a cap.
  readonly questionNumber = signal<number>(0);
  readonly error = signal<string>('');

  // THE INPUT RULE: input enabled only in the Answering phase.
  readonly inputEnabled = computed(() => this.phase() === Phase.Answering);
  readonly phaseName = computed<string>(() => this.phase());

  // One question at a time: the drill view shows only the CURRENT cycle, not the
  // whole transcript. A cycle starts at the most recent 'topic' marker (added at
  // the top of askNext) and runs to the end — topic, question, answer, feedback.
  // `messages` still accumulates the full history for mastery + future restore.
  readonly currentMessages = computed<ChatMessage[]>(() => {
    const all = this.messages();
    let start = 0;
    for (let i = all.length - 1; i >= 0; i--) {
      if (all[i].role === 'topic') {
        start = i;
        break;
      }
    }
    return all.slice(start);
  });

  // Stable per-question key: changes only when a new cycle begins. The view keys
  // its container on this so the transition (fade-in) replays for each question
  // but NOT for the phase changes within one question.
  readonly cycleKey = computed<string>(() => this.currentMessages()[0]?.id ?? '');

  /** Guard predicate: a session can reach /mode once a resume is parsed. */
  readonly hasProfile = computed(() => this.profile() !== null);
  /** Guard predicate: a session can reach /ready and /drill once profile + mode exist. */
  readonly canDrill = computed(() => this.profile() !== null && this.mode() !== null);

  private readonly questionsAsked = computed(() =>
    this.store.rows().reduce((a, r) => a + r.timesSeen, 0),
  );

  /** Load persisted mastery + any saved resume (and mode) on app start. */
  init(): void {
    const saved = this.resume.load();
    if (saved) {
      this.profile.set(saved.profile);
      this.resumeName.set(saved.name);
      const mode = this.loadMode();
      if (mode) this.mode.set(mode); // restore so /ready survives a reload
    }
    // Restore an in-flight drill (transcript + which question) so a reload lands back
    // on the exact /drill/:n screen. Only when a drill is actually possible (resume +
    // mode); the snapshot is always at a stable phase, so this is a pure render.
    if (this.canDrill()) this.restoreDrill();
    // Load persisted mastery first, then (re)seed the saved resume's topics so the
    // panel shows them even if seeding never persisted (defensive; seed is additive).
    void this.store.load().then(() => (saved ? this.store.seed(saved.profile.topics) : undefined));
  }

  private loadMode(): Mode | null {
    try {
      const v = localStorage.getItem(MODE_STORAGE);
      return v === 'interview' || v === 'improve' ? v : null;
    } catch {
      return null;
    }
  }

  private saveMode(mode: Mode | null): void {
    try {
      if (mode) localStorage.setItem(MODE_STORAGE, mode);
      else localStorage.removeItem(MODE_STORAGE);
    } catch {
      // Storage unavailable — mode just won't survive this reload.
    }
  }

  /** LANDING with a resume already on file: skip upload, go pick a mode. */
  async continueWithSavedResume(): Promise<void> {
    if (!this.profile()) return;
    this.phase.set(Phase.Mode);
    await this.router.navigate(['/mode']);
  }

  /** Forget the saved resume and return to the uploader. */
  async clearResume(): Promise<void> {
    this.resume.clear();
    this.saveMode(null);
    // Topics/categories are resume-specific — drop the old plan + its progress so a
    // re-upload seeds a clean set instead of stacking new topics onto the stale ones.
    await this.store.clear();
    this.profile.set(null);
    this.resumeName.set('');
    this.mode.set(null);
    this.messages.set([]);
    this.currentTopic.set(null);
    this.currentQuestion.set('');
    this.questionNumber.set(0);
    this.askedTexts.length = 0;
    this.drill.clear();
    this.error.set('');
    this.phase.set(Phase.Landing);
    await this.router.navigate(['/']);
  }

  /**
   * Softer reset: clear drill progress + the level it derives (the mastery DB) but
   * KEEP the resume, mode, and API key. Re-seeds the current resume's topics so the
   * panel still lists them at "Not started", then returns to a clean restart point.
   */
  async resetProgress(): Promise<void> {
    await this.store.clear();
    const profile = this.profile();
    if (profile) await this.store.seed(profile.topics);
    this.messages.set([]);
    this.currentTopic.set(null);
    this.currentQuestion.set('');
    this.questionNumber.set(0);
    this.askedTexts.length = 0;
    this.drill.clear();
    this.error.set('');
    if (this.canDrill()) {
      this.phase.set(Phase.Ready);
      await this.router.navigate(['/ready']);
    } else if (this.hasProfile()) {
      this.phase.set(Phase.Mode);
      await this.router.navigate(['/mode']);
    } else {
      this.phase.set(Phase.Landing);
      await this.router.navigate(['/']);
    }
  }

  /**
   * The danger button: wipe EVERYTHING — mastery DB, saved resume, mode, API key,
   * and all in-memory session state — and return to the very start. Irreversible.
   */
  async resetAll(): Promise<void> {
    await this.store.clear();
    this.resume.clear();
    this.saveMode(null);
    this.llm.setKey(''); // full wipe includes the credential
    this.profile.set(null);
    this.resumeName.set('');
    this.mode.set(null);
    this.messages.set([]);
    this.currentTopic.set(null);
    this.currentQuestion.set('');
    this.questionNumber.set(0);
    this.error.set('');
    this.askedTexts.length = 0;
    this.drill.clear();
    this.phase.set(Phase.Landing);
    await this.router.navigate(['/']);
  }

  /** LANDING: resume chosen -> parse -> navigate to /mode (or recover to LANDING). */
  async onFileSelected(file: File): Promise<void> {
    this.error.set('');
    if (!this.llm.hasKey()) {
      this.error.set('Enter your Claude API key first.');
      return;
    }
    this.advance(); // Landing -> Parsing
    try {
      const profile = await this.llm.parseResume(file);
      this.profile.set(profile);
      this.resumeName.set(file.name);
      this.resume.save(profile, file.name); // persist: upload once, not every session
      await this.store.seed(profile.topics); // show topics/categories before drilling
      this.advance(); // Parsing -> Mode
      await this.router.navigate(['/mode']);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Could not read that file.');
      this.phase.set(Phase.Landing);
    }
  }

  /**
   * Breadcrumb back-navigation: jump to an earlier step, keeping `phase` in sync
   * with the destination route. Only the real screens ('/', '/mode', '/ready') are
   * valid targets — the breadcrumb only ever offers completed steps.
   */
  async navigateToStep(path: string): Promise<void> {
    const phaseFor: Record<string, Phase> = {
      '/': Phase.Landing,
      '/mode': Phase.Mode,
      '/ready': Phase.Ready,
    };
    const phase = phaseFor[path];
    if (!phase) return;
    this.phase.set(phase);
    await this.router.navigate([path]);
  }

  /** MODE: store the mode -> navigate to /ready. */
  async onModePicked(mode: Mode): Promise<void> {
    this.mode.set(mode);
    this.saveMode(mode); // persist so /ready survives a reload
    this.advance(); // Mode -> Ready
    await this.router.navigate(['/ready']);
  }

  /** READY: Start -> ask the first question (askNext navigates to /drill/1). */
  async onStart(): Promise<void> {
    this.advance(); // Ready -> Asking
    await this.askNext();
  }

  /** ANSWERING (within /drill): record, score, update mastery, show feedback. */
  async onAnswer(text: string): Promise<void> {
    const topic = this.currentTopic();
    const mode = this.mode();
    if (!topic || !mode) return;

    this.addMessage('user', text);
    this.advance(); // Answering -> Scoring (a second submit is now impossible)

    const result = await this.llm.scoreAnswer(this.currentQuestion(), text, topic.topic, mode);
    this.addMessage('feedback', undefined, result);

    const prev = this.store.rows().find((r) => r.topic === topic.topic) ?? null;
    const row = updateMastery(prev, topic.topic, topic.cat, result.score, this.questionsAsked() + 1);
    await this.store.put(row);

    this.advance(); // Scoring -> Feedback
    this.persist(); // stable snapshot: answer scored, feedback shown
  }

  /** FEEDBACK (within /drill): Next question -> back to ASKING. */
  async onNext(): Promise<void> {
    this.advance(); // Feedback -> Asking
    await this.askNext();
  }

  private async askNext(): Promise<void> {
    const profile = this.profile();
    const mode = this.mode();
    if (!profile || !mode) return;

    const topic = pickNextTopic(this.store.rows(), profile.topics, mode, this.questionsAsked());
    this.currentTopic.set(topic);
    const n = this.questionNumber() + 1; // advance the session progress counter
    this.questionNumber.set(n);
    this.addMessage('topic', topic.topic);
    // Each question gets its own URL (/drill/:n). Navigated up front (before the async
    // generation) so the "Generating…" indicator shows on the drill screen, not /ready.
    await this.router.navigate(['/drill', n]);

    let question: string;
    try {
      question = await this.llm.generateQuestion(
        topic.topic,
        topic.subtopics ?? [],
        profile,
        mode,
        this.askedTexts,
      );
    } catch {
      question = 'Failed to generate a question — check your Claude key/connection.';
    }
    this.askedTexts.push(question);
    this.currentQuestion.set(question);
    this.addMessage('assistant', question);

    this.advance(); // Asking -> Answering
    this.persist(); // stable snapshot: question shown, awaiting an answer
  }

  /** Write the in-flight drill to storage. Called only at stable phases (see DrillStore). */
  private persist(): void {
    this.drill.save({
      messages: this.messages(),
      currentTopic: this.currentTopic(),
      currentQuestion: this.currentQuestion(),
      questionNumber: this.questionNumber(),
      phase: this.phase(),
      askedTexts: [...this.askedTexts],
    });
  }

  /** Restore a saved in-flight drill into the session signals (no navigation, no async). */
  private restoreDrill(): void {
    const snap = this.drill.load();
    if (!snap) return;
    this.messages.set(snap.messages);
    this.currentTopic.set(snap.currentTopic);
    this.currentQuestion.set(snap.currentQuestion);
    this.questionNumber.set(snap.questionNumber);
    this.askedTexts.push(...snap.askedTexts);
    // Resume the id counter past the restored messages so new ids don't collide.
    this.nextId = snap.messages.reduce((max, m) => Math.max(max, Number(m.id) || 0), 0);
    this.phase.set(snap.phase);
  }

  private advance(): void {
    this.phase.set(ALLOWED_NEXT[this.phase()]);
  }

  private addMessage(role: ChatMessage['role'], text?: string, result?: ChatMessage['result']): void {
    this.messages.update((m) => [...m, { id: String(++this.nextId), role, text, result }]);
  }
}
