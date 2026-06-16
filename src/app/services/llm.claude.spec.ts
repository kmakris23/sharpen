import { type Mode, type Profile } from '../models/types';
import { LlmService } from './llm.service';

// Stub the HTTP call by overriding the protected callApi — no network.
class TestLlm extends LlmService {
  lastBody: any;
  response: { content?: Array<{ type?: string; text?: string }> } = {
    content: [{ type: 'text', text: '' }],
  };
  fail = false;
  resumeText = 'Senior Angular + .NET developer.';
  extractThrows = false;

  override async callApi(body: Record<string, unknown>) {
    this.lastBody = body;
    if (this.fail) throw new Error('network');
    return this.response;
  }

  override async extractText(): Promise<string> {
    if (this.extractThrows) throw new Error('Unsupported file');
    return this.resumeText;
  }

  // Stub prompt loading (no network). Carries every placeholder so template fills
  // (e.g. the "avoid already-asked" block) still flow through into the request body.
  override async loadPromptText(name: string): Promise<string> {
    return `[${name}] {{resume}} {{topic}} {{subtopics}} {{summary}} {{mode}} {{question}} {{answer}} {{avoid}}`;
  }
}

const profile: Profile = { summary: 'Angular + .NET dev', topics: [], resumeLevel: 3 };
const textRes = (text: string) => ({ content: [{ type: 'text', text }] });
const scoreJson = (o: Partial<Record<string, unknown>>) =>
  textRes(
    JSON.stringify({
      score: 5,
      strengths: [],
      weaknesses: [],
      articulationNote: '',
      teaching: null,
      ...o,
    }),
  );

function llm(): TestLlm {
  const s = new TestLlm();
  s.setKey('sk-ant-test');
  return s;
}

describe('LlmService.generateQuestion', () => {
  it('returns trimmed question text and targets the right model', async () => {
    const s = llm();
    s.response = textRes('  What is OnPush change detection?  ');
    const q = await s.generateQuestion('Angular', [], profile, 'improve', []);
    expect(q).toBe('What is OnPush change detection?');
    expect(s.lastBody.model).toBe('claude-opus-4-8');
  });

  it('forbids repeating already-asked questions', async () => {
    const s = llm();
    s.response = textRes('new question');
    await s.generateQuestion('Angular', [], profile, 'interview', ['old question']);
    expect(JSON.stringify(s.lastBody)).toContain('old question');
  });

  it('passes subtopics as a hint but tells the interviewer not to limit to them', async () => {
    const s = llm();
    s.response = textRes('q');
    await s.generateQuestion('Angular', ['SignalR real-time', 'change detection'], profile, 'interview', []);
    const body = JSON.stringify(s.lastBody);
    expect(body).toContain('SignalR real-time');
    expect(body).toContain('do NOT limit yourself to them');
  });

  it('omits the subtopics hint entirely when there are none', async () => {
    const s = llm();
    s.response = textRes('q');
    await s.generateQuestion('Angular', [], profile, 'interview', []);
    expect(JSON.stringify(s.lastBody)).not.toContain('angles of');
  });
});

describe('LlmService.scoreAnswer', () => {
  it('parses a ScoreResult and clamps the score', async () => {
    const s = llm();
    s.response = scoreJson({ score: 12, strengths: ['clear'], articulationNote: 'tighten' });
    const r = await s.scoreAnswer('q', 'a', 'topic', 'improve');
    expect(r.score).toBe(10);
    expect(r.strengths).toEqual(['clear']);
    expect(r.articulationNote).toBe('tighten');
  });

  it('sends the structured-output schema', async () => {
    const s = llm();
    s.response = scoreJson({});
    await s.scoreAnswer('q', 'a', 'topic', 'improve');
    expect(s.lastBody.output_config.format.type).toBe('json_schema');
  });

  it('keeps teaching only when weak AND improve', async () => {
    const s = llm();
    s.response = scoreJson({ score: 3, teaching: 'lesson' });
    expect((await s.scoreAnswer('q', 'a', 't', 'improve')).teaching).toBe('lesson');

    s.response = scoreJson({ score: 3, teaching: 'lesson' });
    expect((await s.scoreAnswer('q', 'a', 't', 'interview' as Mode)).teaching).toBeNull(); // wrong mode
    s.response = scoreJson({ score: 8, teaching: 'lesson' });
    expect((await s.scoreAnswer('q', 'a', 't', 'improve')).teaching).toBeNull(); // strong answer
  });

  it('is defensive: malformed JSON -> fallback (never throws)', async () => {
    const s = llm();
    s.response = textRes('not json at all');
    const r = await s.scoreAnswer('q', 'a', 't', 'improve');
    expect(r.score).toBe(0);
    expect(r.articulationNote).toContain('parse');
    expect(r.teaching).toBeNull();
  });

  it('swallows API errors -> fallback', async () => {
    const s = llm();
    s.fail = true;
    const r = await s.scoreAnswer('q', 'a', 't', 'improve');
    expect(r.score).toBe(0);
    expect(r.articulationNote).toContain('failed');
  });
});

const file = () => new File(['cv'], 'r.pdf');

describe('LlmService.parseResume', () => {
  it('keeps the resume-derived topics, dedupes, clamps level', async () => {
    const s = llm();
    s.response = textRes(
      JSON.stringify({
        summary: 'Go dev',
        topics: [
          { topic: 'Go: goroutine scheduling', cat: 'backend' },
          { topic: 'Postgres: index design', cat: 'data' }, // free-form -> kept
          { topic: 'Go: goroutine scheduling', cat: 'backend' }, // dup -> deduped
        ],
        resumeLevel: 9,
      }),
    );
    const p = await s.parseResume(file());
    expect(p.summary).toBe('Go dev');
    expect(p.topics).toEqual([
      { topic: 'Go: goroutine scheduling', cat: 'backend', order: 0 },
      { topic: 'Postgres: index design', cat: 'data', order: 1 }, // order preserves the returned sequence
    ]);
    expect(p.resumeLevel).toBe(5); // clamped from 9
  });

  it('extracts subtopics (trimmed + deduped), omitting the field when empty', async () => {
    const s = llm();
    s.response = textRes(
      JSON.stringify({
        summary: 'Angular dev',
        topics: [
          { topic: 'Angular', cat: 'frontend', subtopics: [' SignalR ', 'RxJS', 'SignalR', ''] },
          { topic: 'Postgres', cat: 'data', subtopics: [] },
          { topic: 'Go', cat: 'backend' }, // missing subtopics entirely
        ],
        resumeLevel: 3,
      }),
    );
    const p = await s.parseResume(file());
    expect(p.topics).toEqual([
      { topic: 'Angular', cat: 'frontend', order: 0, subtopics: ['SignalR', 'RxJS'] },
      { topic: 'Postgres', cat: 'data', order: 1 }, // empty -> field omitted
      { topic: 'Go', cat: 'backend', order: 2 }, // absent -> field omitted
    ]);
  });

  it('parses per-category baseline levels, dropping unknown cats and clamping', async () => {
    const s = llm();
    s.response = textRes(
      JSON.stringify({
        summary: 'Go dev',
        topics: [
          { topic: 'Go: goroutine scheduling', cat: 'backend' },
          { topic: 'Postgres: index design', cat: 'data' },
        ],
        resumeLevel: 3,
        categoryLevels: [
          { cat: 'backend', level: 9 }, // clamped -> 5
          { cat: 'data', level: 2 },
          { cat: 'ghost', level: 4 }, // no topic backs it -> dropped
        ],
      }),
    );
    const p = await s.parseResume(file());
    expect(p.categoryLevels).toEqual([
      { cat: 'backend', level: 5 },
      { cat: 'data', level: 2 },
    ]);
  });

  it('tolerates a missing categoryLevels (older/odd responses) -> empty', async () => {
    const s = llm();
    s.response = textRes(
      JSON.stringify({ summary: 's', topics: [{ topic: 't', cat: 'c' }], resumeLevel: 3 }),
    );
    expect((await s.parseResume(file())).categoryLevels).toEqual([]);
  });

  it('sends the structured-output schema (no fixed taxonomy)', async () => {
    const s = llm();
    s.response = textRes(
      JSON.stringify({ summary: 's', topics: [{ topic: 't', cat: 'c' }], resumeLevel: 3 }),
    );
    await s.parseResume(file());
    expect(s.lastBody.output_config.format.type).toBe('json_schema');
    // The prompt no longer ships a canonical topic list.
    expect(JSON.stringify(s.lastBody)).not.toContain('Angular: change detection');
  });

  it('throws when no valid topics come back (block until parsed)', async () => {
    const s = llm();
    s.response = textRes(JSON.stringify({ summary: 's', topics: [], resumeLevel: 3 }));
    await expect(s.parseResume(file())).rejects.toThrow('No drillable topics');
  });

  it('throws on malformed JSON so the UI can recover', async () => {
    const s = llm();
    s.response = textRes('not json');
    await expect(s.parseResume(file())).rejects.toThrow('parse the resume');
  });

  it('propagates API errors (no fixed-taxonomy fallback)', async () => {
    const s = llm();
    s.fail = true;
    await expect(s.parseResume(file())).rejects.toThrow();
  });

  it('throws on empty extracted text', async () => {
    const s = llm();
    s.resumeText = '   ';
    await expect(s.parseResume(file())).rejects.toThrow('no extractable text');
  });

  it('propagates extraction errors (bad file) so the UI can recover', async () => {
    const s = llm();
    s.extractThrows = true;
    await expect(s.parseResume(file())).rejects.toThrow('Unsupported file');
  });
});

// Exercises the REAL callApi retry/truncation logic by stubbing the raw fetch.
interface FakeRes {
  status?: number;
  json?: unknown;
  throws?: boolean;
}
class RetryLlm extends LlmService {
  queue: FakeRes[] = [];
  calls = 0;
  bodies: any[] = [];
  override retryDelayMs(): number {
    return 0; // no backoff wait in tests
  }
  override async fetchApi(body: Record<string, unknown>): Promise<Response> {
    this.bodies.push(body);
    const r = this.queue[Math.min(this.calls, this.queue.length - 1)];
    this.calls++;
    if (r.throws) throw new Error('network');
    const status = r.status ?? 200;
    return { status, ok: status >= 200 && status < 300, json: async () => r.json } as Response;
  }
  run(body: Record<string, unknown>) {
    return this.callApi(body);
  }
}

const ok = (text: string, stop = 'end_turn') => ({
  status: 200,
  json: { content: [{ type: 'text', text }], stop_reason: stop },
});

describe('LlmService.callApi — resilience', () => {
  it('retries an overload (529) then succeeds', async () => {
    const s = new RetryLlm();
    s.queue = [{ status: 529 }, ok('recovered')];
    const res = await s.run({ max_tokens: 1024 });
    expect(s.calls).toBe(2);
    expect(res.content?.[0].text).toBe('recovered');
  });

  it('retries network errors and rate limits (429)', async () => {
    const s = new RetryLlm();
    s.queue = [{ throws: true }, { status: 429 }, ok('done')];
    const res = await s.run({ max_tokens: 1024 });
    expect(s.calls).toBe(3);
    expect(res.content?.[0].text).toBe('done');
  });

  it('re-requests with a doubled token budget on a max_tokens cutoff', async () => {
    const s = new RetryLlm();
    s.queue = [ok('truncated', 'max_tokens'), ok('full')];
    const res = await s.run({ max_tokens: 1024 });
    expect(s.calls).toBe(2);
    expect(s.bodies[0].max_tokens).toBe(1024);
    expect(s.bodies[1].max_tokens).toBe(2048); // bumped
    expect(res.content?.[0].text).toBe('full');
  });

  it('fails fast on a client error (bad key) without retrying', async () => {
    const s = new RetryLlm();
    s.queue = [{ status: 401 }];
    await expect(s.run({ max_tokens: 1024 })).rejects.toThrow('401');
    expect(s.calls).toBe(1);
  });

  it('gives up after exhausting retries on a persistent overload', async () => {
    const s = new RetryLlm();
    s.queue = [{ status: 529 }];
    await expect(s.run({ max_tokens: 1024 })).rejects.toThrow('529');
    expect(s.calls).toBe(5); // 1 try + 4 retries
  });
});
