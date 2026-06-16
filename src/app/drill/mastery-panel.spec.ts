import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type MasteryRow, type Profile } from '../models/types';
import { DrillSession } from '../services/drill-session';
import { MasteryStore } from '../services/mastery.store';
import { MasteryPanel } from './mastery-panel';

class FakeStore {
  readonly _rows = signal<MasteryRow[]>([]);
  rows = this._rows.asReadonly();
}

function row(
  topic: string,
  cat: MasteryRow['cat'],
  rollingScore: number,
  timesSeen = 2,
  order?: number,
): MasteryRow {
  return { topic, cat, rollingScore, timesSeen, lastAskedAtQ: 1, resurfaceAfterQ: 5, order };
}

describe('MasteryPanel', () => {
  let store: FakeStore;

  // Popovers are portaled to <body>; drop any that a hover test left behind.
  afterEach(() => document.querySelectorAll('body > [role="tooltip"]').forEach((n) => n.remove()));

  function render(profile: Profile | null = null) {
    store = new FakeStore();
    TestBed.configureTestingModule({
      providers: [
        { provide: MasteryStore, useValue: store },
        { provide: DrillSession, useValue: { profile: signal(profile) } },
      ],
    });
    const fixture = TestBed.createComponent(MasteryPanel);
    fixture.detectChanges();
    return fixture;
  }

  it('shows Not started and empty hints with no data', () => {
    const el = render().nativeElement as HTMLElement;
    expect(el.textContent).toContain('Not started'); // not "Calibrating…" — nothing in progress yet
    expect(el.textContent).toContain('No categories yet');
    expect(el.textContent).toContain('No topics yet');
  });

  it('surfaces resume baseline estimates (faint, marked) before any drilling', () => {
    const profile: Profile = {
      summary: 's',
      topics: [],
      resumeLevel: 3, // Senior
      categoryLevels: [{ cat: 'frontend', level: 4 }], // Staff
    };
    const fixture = render(profile);
    // A seeded, un-answered row: the category exists but nothing is validated yet.
    store._rows.set([row('Angular: change detection', 'frontend', 0, 0)]);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Senior · 3'); // overall baseline shown…
    expect(el.textContent).toContain('Staff · 4'); // …and the per-category baseline
    // The EST badge marks both as provisional; hovering reveals the explanation (portaled to body).
    expect(el.querySelectorAll('app-est-badge').length).toBe(2); // overall + the one category
    const estTrigger = el.querySelector('app-est-badge [tabindex="0"]') as HTMLElement;
    estTrigger.dispatchEvent(new MouseEvent('mouseenter'));
    expect(document.body.textContent?.toLowerCase()).toContain('not yet validated by drilling');
    estTrigger.dispatchEvent(new MouseEvent('mouseleave'));
    expect(el.textContent).not.toContain('Not started'); // estimate replaces the empty state
  });

  it('replaces the estimate with the validated level once a category calibrates', () => {
    const profile: Profile = {
      summary: 's',
      topics: [],
      resumeLevel: 3,
      categoryLevels: [{ cat: 'frontend', level: 5 }], // baseline says Principal…
    };
    const fixture = render(profile);
    // Two real answers across two cats at score 6 -> validated Senior, not the estimate.
    store._rows.set([row('a', 'frontend', 6, 2), row('b', 'backend', 6, 2)]);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Senior · 3'); // validated reading wins
    expect(el.textContent).not.toContain('Principal · 5'); // estimate no longer shown
    expect(el.querySelector('app-est-badge')).toBeNull(); // no estimate badge once validated
  });

  it('shows a level and topic bars once calibrated', () => {
    const fixture = render();
    store._rows.set([
      row('Angular: change detection', 'frontend', 6),
      row('.NET: DI lifetimes', 'backend', 6),
    ]); // 4 answers across 2 cats, score 6 -> Senior(3)
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Senior · 3');
    expect(el.textContent).toContain('Angular: change detection');
    expect(el.querySelectorAll('.bg-mid').length).toBeGreaterThan(0); // score 6 -> amber
  });

  it('renders topics in plan order, not by score (rows arrive scrambled)', () => {
    const fixture = render();
    // Rows as IndexedDB hands them back (alphabetical by topic), with high-scoring
    // topics first — neither row array order nor score should drive the display.
    store._rows.set([
      row('.NET: DI lifetimes', 'backend', 9, 2, 2),
      row('Angular: change detection', 'frontend', 3, 2, 0),
      row('Angular: RxJS operators', 'frontend', 8, 2, 1),
    ]);
    fixture.detectChanges();

    // The topic-name span is the one paired with a score span (.text-neutral-500).
    const topics = [...(fixture.nativeElement as HTMLElement).querySelectorAll('span.text-neutral-500')]
      .map((score) => score.previousElementSibling?.textContent?.trim())
      .filter((t): t is string => !!t);
    // Plan order: change detection (0), RxJS (1), DI lifetimes (2) — not by score, not alphabetical.
    expect(topics).toEqual([
      'Angular: change detection',
      'Angular: RxJS operators',
      '.NET: DI lifetimes',
    ]);
  });

  it('shows an info icon whose popover lists the subtopics line by line on hover', () => {
    const fixture = render();
    store._rows.set([{ ...row('Angular', 'frontend', 6), subtopics: ['SignalR', 'RxJS'] }]);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    const icon = el.querySelector('svg[aria-label]')?.parentElement as HTMLElement;
    expect(icon).toBeTruthy(); // info icon present when subtopics exist
    expect(document.body.querySelector('[role="tooltip"]')).toBeNull(); // hidden until hovered

    icon.dispatchEvent(new MouseEvent('mouseenter')); // reveal the popover (portaled to body)
    const tip = document.body.querySelector('[role="tooltip"]')!;
    // Heading, then one line per subtopic.
    expect([...tip.children].map((c) => c.textContent?.trim())).toEqual([
      'Some subtopics we found',
      'SignalR',
      'RxJS',
    ]);

    icon.dispatchEvent(new MouseEvent('mouseleave')); // dismiss
    expect(document.body.querySelector('[role="tooltip"]')).toBeNull();
  });

  it('renders no info icon when a topic has no subtopics', () => {
    const fixture = render();
    store._rows.set([row('Angular', 'frontend', 6)]); // no subtopics
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('svg[aria-label]')).toBeNull();
  });

  it('colors a weak topic with the weak tone', () => {
    const fixture = render();
    store._rows.set([row('Architecture: multi-tenancy', 'architecture', 2)]);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.bg-weak')).not.toBeNull();
  });
});
