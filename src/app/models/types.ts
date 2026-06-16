// All shared types for Sharpen. Shapes track a future Postgres schema 1:1 so the
// IndexedDB -> DB swap stays body-only. See SPEC.md §Data Model.

export type Mode = 'interview' | 'improve';
// A category label. Not a fixed enum — categories are extracted from each resume
// (e.g. a Go/K8s resume yields its own groupings), so this is an open string.
export type Category = string;

export interface DrillTopic {
  topic: string; // the BASE technology, extracted from the resume during parseResume (e.g. "Angular")
  cat: Category; // its category grouping, also resume-derived
  // Optional, resume-evidenced angles within the topic (e.g. ["SignalR real-time", "change detection"]).
  // DESCRIPTIVE badges + question hints only — questions range across the whole topic, never limited to these.
  subtopics?: string[];
  order?: number; // position in the generated plan; preserves the parse order through display + persistence
}

// Numbered seniority bands (1..5). Display name via LEVEL_NAMES[level - 1].
export type Level = 1 | 2 | 3 | 4 | 5;
export const LEVEL_NAMES = ['Junior', 'Mid', 'Senior', 'Staff', 'Principal'] as const;

// A computed level reading. `level` is null while calibrating (not enough data).
export interface LevelEstimate {
  level: Level | null; // null = still calibrating
  numeric: number; // continuous position 1.0–5.0 (0 while calibrating)
  score: number; // underlying aggregate rolling score, 0–10
  progressToNext: number; // 0–1, how far through the current band toward the next
  samples: number; // answers backing this estimate (confidence proxy)
}

// A resume-derived baseline level for one category. Provisional — shown faintly
// until real drilling produces a validated LevelEstimate for that category.
export interface CategoryLevel {
  cat: Category;
  level: Level;
}

export interface Profile {
  summary: string; // one-line human summary of the resume
  topics: DrillTopic[]; // resume-derived topics this user will be drilled on
  resumeLevel: Level; // overall baseline estimate from the resume; provisional, shown until calibrated
  categoryLevels?: CategoryLevel[]; // per-category baseline from the resume (optional: absent on legacy saves)
}

export interface ScoreResult {
  score: number; // 0–10
  strengths: string[];
  weaknesses: string[];
  articulationNote: string; // precision-of-wording feedback
  teaching: string | null; // populated only when weak AND mode === 'improve'
}

// THE core persisted entity -> maps to a future topic_mastery table.
// Resurfacing is question-count based (no epoch/time fields):
//   questionsAsked = sum of timesSeen across all rows;
//   a topic is due when (questionsAsked - lastAskedAtQ) >= resurfaceAfterQ.
export interface MasteryRow {
  topic: string; // keyPath — the base topic (mastery is tracked per base technology)
  cat: Category;
  subtopics?: string[]; // carried from the plan for badge display; not used in scoring
  rollingScore: number; // recency-weighted, 0–10
  timesSeen: number;
  lastAskedAtQ: number; // global question index when last asked (0 = never)
  resurfaceAfterQ: number; // resurface gap: questions until due again
  order?: number; // plan order from parse (-> a future `plan_order` column). Display order;
  // optional so pre-existing rows (and the count-based scheduler) ignore it gracefully.
}

export interface ChatMessage {
  id: string;
  role: 'assistant' | 'user' | 'topic' | 'feedback';
  text?: string;
  result?: ScoreResult; // when role === 'feedback'
}

// The phase state machine — the spine of the UI. Transitions are strict.
export enum Phase {
  Landing = 'landing',
  Parsing = 'parsing',
  Mode = 'mode',
  Ready = 'ready',
  Asking = 'asking',
  Answering = 'answering',
  Scoring = 'scoring',
  Feedback = 'feedback',
}
