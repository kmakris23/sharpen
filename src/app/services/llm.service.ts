// The "backend": all Claude access lives behind this service (SPEC §LLM Service).
// v0 is browser-direct with a user-provided key. Prompt TEXT lives in editable
// `.md` files under public/prompts (loaded at runtime, cached); the schemas and
// orchestration stay here. callApi is resilient: it retries overload/5xx and
// bumps the token budget on truncation so transient failures don't surface.

import { Injectable, computed, signal } from '@angular/core';
import {
  type CategoryLevel,
  type DrillTopic,
  type Level,
  type Mode,
  type Profile,
  type ScoreResult,
} from '../models/types';
import { extractResumeText } from './resume-extract';

// Browser-direct Claude calls use raw fetch (the Messages API) rather than
// @anthropic-ai/sdk: the SDK bundles Node-only credential code (node:fs/path)
// that breaks the browser/test build. SWAP POINT later moves this behind a proxy.
const KEY_STORAGE = 'sharpen.claudeKey';
const MODEL = 'claude-opus-4-8';
const API_URL = 'https://api.anthropic.com/v1/messages';
const RESUME_TEXT_CAP = 8000; // keep input tokens bounded

// Resilience knobs (SPEC §LLM Service — "must not fail on transient errors").
const MAX_RETRIES = 4; // attempts after the first try, for overload/5xx/network
const MAX_TOKENS_CAP = 4096; // ceiling when re-requesting after a max_tokens cutoff

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const toStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

interface ClaudeResponse {
  content?: Array<{ type?: string; text?: string }>;
  stop_reason?: string; // 'end_turn' | 'max_tokens' | ... — drives the truncation retry
}

// Structured-output schema for ScoreResult. No numeric/length constraints
// (unsupported by structured outputs) — the prompt states the 0–10 range.
const SCORE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    score: { type: 'number' },
    strengths: { type: 'array', items: { type: 'string' } },
    weaknesses: { type: 'array', items: { type: 'string' } },
    articulationNote: { type: 'string' },
    teaching: { type: ['string', 'null'] },
  },
  required: ['score', 'strengths', 'weaknesses', 'articulationNote', 'teaching'],
};

// parseResume: extract the drill topics + their category groupings FROM the resume
// (resume-driven, not a fixed taxonomy). Topics/categories are free-form strings.
const PROFILE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    topics: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          topic: { type: 'string' },
          cat: { type: 'string' },
          subtopics: { type: 'array', items: { type: 'string' } },
        },
        required: ['topic', 'cat', 'subtopics'],
      },
    },
    resumeLevel: { type: 'number' },
    categoryLevels: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          cat: { type: 'string' },
          level: { type: 'number' },
        },
        required: ['cat', 'level'],
      },
    },
  },
  required: ['summary', 'topics', 'resumeLevel', 'categoryLevels'],
};

// Prompt text lives in public/prompts/<name>.md. `*.user` files are templates
// with {{placeholder}} slots filled at call time; `*.system` files are static.
const fill = (template: string, vars: Record<string, string>): string =>
  template.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? '');

@Injectable({ providedIn: 'root' })
export class LlmService {
  private readonly _key = signal<string>(this.loadKey());
  private readonly promptCache = new Map<string, Promise<string>>();

  /** The user's Claude API key (empty string = not set). */
  readonly key = this._key.asReadonly();
  readonly hasKey = computed(() => this._key().trim().length > 0);

  /** Set (or clear) the key; persists to localStorage best-effort. */
  setKey(key: string): void {
    const trimmed = key.trim();
    this._key.set(trimmed);
    try {
      if (trimmed) localStorage.setItem(KEY_STORAGE, trimmed);
      else localStorage.removeItem(KEY_STORAGE);
    } catch {
      // Storage unavailable (private mode) — key stays in memory for this session.
    }
  }

  private loadKey(): string {
    try {
      return localStorage.getItem(KEY_STORAGE) ?? '';
    } catch {
      return '';
    }
  }

  // --- SWAP POINT 0: parseResume ------------------------------------------
  /**
   * Extract resume text (PDF/DOCX/text) + one Claude call that derives the drill
   * topics and their category groupings FROM the resume and estimates `resumeLevel`.
   * A drill requires a successfully parsed resume: extraction errors (e.g. unsupported
   * file), empty text, and API/parse failures all throw so the UI recovers to LANDING
   * and asks for another file — there is no fixed-taxonomy fallback.
   */
  async parseResume(file: File): Promise<Profile> {
    const text = (await this.extractText(file)).slice(0, RESUME_TEXT_CAP); // may throw (bad file)
    if (!text.trim()) throw new Error('Resume had no extractable text — try another file.');
    const [system, user] = await Promise.all([this.prompt('parse.system'), this.prompt('parse.user')]);
    const res = await this.callApi({
      model: MODEL,
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: fill(user, { resume: text }) }],
      output_config: { format: { type: 'json_schema', schema: PROFILE_SCHEMA } },
    });
    return parseProfile(firstText(res));
  }

  /** Extract text from the resume file. Overridable for tests. */
  protected extractText(file: File): Promise<string> {
    return extractResumeText(file);
  }

  /** Load a prompt file from public/prompts (cached per name). Overridable for tests. */
  protected loadPromptText(name: string): Promise<string> {
    return fetch(new URL(`prompts/${name}.md`, document.baseURI)).then((r) => {
      if (!r.ok) throw new Error(`Missing prompt: ${name}`);
      return r.text();
    });
  }

  private prompt(name: string): Promise<string> {
    let p = this.promptCache.get(name);
    if (!p) {
      p = this.loadPromptText(name);
      this.promptCache.set(name, p);
    }
    return p;
  }

  // --- SWAP POINT 1: generateQuestion (real Claude) -----------------------
  async generateQuestion(
    topic: string,
    subtopics: readonly string[],
    profile: Profile,
    mode: Mode,
    askedTexts: string[],
  ): Promise<string> {
    const avoid = askedTexts.length
      ? `\nDo NOT repeat or paraphrase any of these already-asked questions:\n- ${askedTexts.join('\n- ')}`
      : '';
    // Subtopics are a HINT, never a fence: surface the resume's known angles but tell
    // the interviewer to roam the whole topic so questions aren't pinned to them.
    const subs = subtopics.length
      ? ` The resume shows experience with these angles of ${topic}: ${subtopics.join(', ')}. You may draw on them, but do NOT limit yourself to them — range across the whole topic.`
      : '';
    const [system, user] = await Promise.all([
      this.prompt('question.system'),
      this.prompt('question.user'),
    ]);
    const res = await this.callApi({
      model: MODEL,
      max_tokens: 512,
      system,
      messages: [
        { role: 'user', content: fill(user, { topic, subtopics: subs, summary: profile.summary, mode, avoid }) },
      ],
    });
    return firstText(res).trim();
  }

  // --- SWAP POINT 2: scoreAnswer (real Claude, structured JSON) -----------
  async scoreAnswer(
    question: string,
    answer: string,
    topic: string,
    mode: Mode,
  ): Promise<ScoreResult> {
    try {
      const [system, user] = await Promise.all([
        this.prompt('score.system'),
        this.prompt('score.user'),
      ]);
      const res = await this.callApi({
        model: MODEL,
        max_tokens: 1024,
        system,
        messages: [{ role: 'user', content: fill(user, { topic, mode, question, answer }) }],
        output_config: { format: { type: 'json_schema', schema: SCORE_SCHEMA } },
      });
      return parseScore(firstText(res), mode);
    } catch {
      return fallbackScore('Scoring request failed — check your Claude key/connection.');
    }
  }

  /**
   * POST to the Claude Messages API, browser-direct with the user's key. Built to
   * not surface transient failures: retries network errors and overload/rate-limit/
   * 5xx (429, 529, 5xx) with backoff, and on a `max_tokens` cutoff re-requests with a
   * doubled token budget (up to MAX_TOKENS_CAP). Only client errors (bad key/request,
   * 4xx other than 429) and a fully exhausted retry budget throw. Overridable for tests.
   */
  protected async callApi(body: Record<string, unknown>): Promise<ClaudeResponse> {
    let maxTokens = Number(body['max_tokens']) || 1024;
    let lastError: unknown = new Error('Claude API unavailable');

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) await delay(this.retryDelayMs(attempt));

      let res: Response;
      try {
        res = await this.fetchApi({ ...body, max_tokens: maxTokens });
      } catch (e) {
        lastError = e; // network/CORS blip — retry
        continue;
      }

      // Overloaded (529), rate-limited (429), or any 5xx — transient, retry.
      if (res.status === 429 || res.status >= 500) {
        lastError = new Error(`Claude API error ${res.status}`);
        continue;
      }
      // Other non-2xx (bad key/request) won't fix themselves — fail fast.
      if (!res.ok) throw new Error(`Claude API error ${res.status}`);

      const json = (await res.json()) as ClaudeResponse;
      // Response was cut off mid-output — re-request with a bigger budget.
      if (json.stop_reason === 'max_tokens' && maxTokens < MAX_TOKENS_CAP) {
        maxTokens = Math.min(maxTokens * 2, MAX_TOKENS_CAP);
        lastError = new Error('Claude response was truncated (max_tokens).');
        continue;
      }
      return json;
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  /** The raw fetch (split out so callApi's retry logic stays unit-testable). */
  protected fetchApi(body: Record<string, unknown>): Promise<Response> {
    return fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.key(),
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    });
  }

  /** Backoff before retry `attempt` (1-based). Overridable for tests (return 0). */
  protected retryDelayMs(attempt: number): number {
    return Math.min(8000, 2 ** (attempt - 1) * 500) + Math.random() * 250; // 0.5s,1s,2s,4s + jitter
  }
}

function firstText(res: ClaudeResponse): string {
  const block = (res?.content ?? []).find((b) => b?.type === 'text');
  return typeof block?.text === 'string' ? block.text : '';
}

function parseScore(text: string, mode: Mode): ScoreResult {
  try {
    const raw = JSON.parse(text) as Record<string, unknown>;
    const score = clamp(Number(raw['score']) || 0, 0, 10);
    const result: ScoreResult = {
      score,
      strengths: toStringArray(raw['strengths']),
      weaknesses: toStringArray(raw['weaknesses']),
      articulationNote: typeof raw['articulationNote'] === 'string' ? raw['articulationNote'] : '',
      teaching: typeof raw['teaching'] === 'string' ? (raw['teaching'] as string) : null,
    };
    // Enforce the teaching rule client-side regardless of what the model returned.
    if (!(score <= 5 && mode === 'improve')) result.teaching = null;
    return result;
  } catch {
    return fallbackScore('Could not parse the scoring response.');
  }
}

function fallbackScore(note: string): ScoreResult {
  return { score: 0, strengths: [], weaknesses: [], articulationNote: note, teaching: null };
}

function parseProfile(text: string): Profile {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error('Could not parse the resume — try another file.');
  }
  const seen = new Set<string>();
  const topics: DrillTopic[] = [];
  const rawTopics = Array.isArray(raw['topics']) ? (raw['topics'] as unknown[]) : [];
  for (const t of rawTopics) {
    if (!t || typeof t !== 'object') continue;
    const topic = (t as { topic?: unknown }).topic;
    const cat = (t as { cat?: unknown }).cat;
    if (typeof topic === 'string' && topic.trim() && typeof cat === 'string' && cat.trim() && !seen.has(topic)) {
      seen.add(topic);
      // Subtopics are descriptive badges/hints only (questions aren't limited to them):
      // trim, drop blanks, dedupe; omit the field entirely when there are none.
      const subtopics = [
        ...new Set(toStringArray((t as { subtopics?: unknown }).subtopics).map((s) => s.trim()).filter(Boolean)),
      ];
      // `order` = position in the returned array (the model's deliberate ordering),
      // assigned here rather than trusted from the model so it's always a clean 0..n-1.
      topics.push({ topic: topic.trim(), cat: cat.trim(), order: topics.length, ...(subtopics.length ? { subtopics } : {}) });
    }
  }
  // A drill needs real topics — no fixed-taxonomy fallback (block until parsed).
  if (!topics.length) throw new Error('No drillable topics found in that resume — try another file.');
  return {
    summary:
      typeof raw['summary'] === 'string' && raw['summary'] ? (raw['summary'] as string) : 'Developer',
    topics,
    resumeLevel: clamp(Math.round(Number(raw['resumeLevel']) || 3), 1, 5) as Level,
    categoryLevels: parseCategoryLevels(raw['categoryLevels'], topics),
  };
}

// Per-category baseline levels, kept only for categories that actually back a topic
// (so a stray category can't leak in) and deduped. Levels clamped to 1–5.
function parseCategoryLevels(raw: unknown, topics: DrillTopic[]): CategoryLevel[] {
  if (!Array.isArray(raw)) return [];
  const validCats = new Set(topics.map((t) => t.cat));
  const seen = new Set<string>();
  const out: CategoryLevel[] = [];
  for (const e of raw) {
    if (!e || typeof e !== 'object') continue;
    const cat = (e as { cat?: unknown }).cat;
    const level = (e as { level?: unknown }).level;
    if (typeof cat !== 'string') continue;
    const c = cat.trim();
    if (!c || !validCats.has(c) || seen.has(c)) continue;
    seen.add(c);
    out.push({ cat: c, level: clamp(Math.round(Number(level) || 3), 1, 5) as Level });
  }
  return out;
}
