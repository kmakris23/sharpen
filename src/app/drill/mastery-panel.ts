import { Component, computed, inject } from '@angular/core';
import { type Category, type Level, LEVEL_NAMES, type LevelEstimate } from '../models/types';
import { DrillSession } from '../services/drill-session';
import { MasteryStore } from '../services/mastery.store';
import { byPlanOrder, computeCategoryLevels, computeLevel } from '../services/scheduler';
import { EstBadge } from './est-badge';
import { Popover } from './popover';

// The signature element: a seniority level header + per-category levels + topic
// score bars (weak->strong). Reads the store's reactive rows; recomputes levels
// whenever mastery changes. Before a reading is validated by real drilling it
// falls back to the resume-derived baseline, shown faintly + marked an estimate.
// Level display strings are built in TS (LEVEL_NAMES is not referenced in the
// template, per the enum/const-in-template convention).
@Component({
  selector: 'app-mastery-panel',
  imports: [EstBadge, Popover],
  templateUrl: './mastery-panel.html',
  // Fill the sidebar so the topics list (below) can flex and scroll on its own
  // instead of growing the panel and forcing the whole page to scroll.
  host: { class: 'flex min-h-0 flex-1 flex-col' },
  styles: `
    /* Pure-CSS scroll shadows: a fixed shadow sits at each edge while a
       background-colored cover (scrolling with the content) masks it at the
       extremes — so the bottom shadow only shows while topics stay hidden. */
    .topic-scroll {
      background:
        linear-gradient(var(--color-neutral-950) 30%, transparent) center top / 100% 24px,
        linear-gradient(transparent, var(--color-neutral-950) 70%) center bottom / 100% 24px,
        radial-gradient(farthest-side at 50% 0, rgb(0 0 0 / 0.5), transparent) center top / 100% 10px,
        radial-gradient(farthest-side at 50% 100%, rgb(0 0 0 / 0.5), transparent) center bottom / 100% 10px;
      background-repeat: no-repeat;
      background-attachment: local, local, scroll, scroll;
      /* Firefox: thin, theme-matched track + thumb. */
      scrollbar-width: thin;
      scrollbar-color: var(--color-neutral-700) transparent;
    }

    /* WebKit/Blink: a slim, rounded thumb that only reads on hover. */
    .topic-scroll::-webkit-scrollbar {
      width: 6px;
    }
    .topic-scroll::-webkit-scrollbar-track {
      background: transparent;
    }
    .topic-scroll::-webkit-scrollbar-thumb {
      background: var(--color-neutral-700);
      border-radius: 9999px;
    }
    .topic-scroll::-webkit-scrollbar-thumb:hover {
      background: var(--color-neutral-600);
    }
  `,
})
export class MasteryPanel {
  private readonly store = inject(MasteryStore);
  private readonly session = inject(DrillSession);

  // Resume baselines (provisional). Overall is `resumeLevel`; per-category comes
  // from the parsed `categoryLevels`, keyed for quick lookup by category.
  private readonly baselineOverall = computed<Level | null>(
    () => this.session.profile()?.resumeLevel ?? null,
  );
  private readonly baselineByCat = computed<Map<Category, Level>>(() => {
    const map = new Map<Category, Level>();
    for (const c of this.session.profile()?.categoryLevels ?? []) map.set(c.cat, c.level);
    return map;
  });

  protected readonly overall = computed(() =>
    view(computeLevel(this.store.rows()), this.baselineOverall()),
  );

  protected readonly categories = computed(() => {
    const levels = computeCategoryLevels(this.store.rows());
    const base = this.baselineByCat();
    return Object.entries(levels).map(([cat, est]) => ({ cat, ...view(est, base.get(cat) ?? null) }));
  });

  // Topics in plan order (grouped by category, resume-prominence within) — the
  // deliberate order from parse, stable across reloads. Per-bar color/score still
  // surfaces weakness, so we don't need to reorder by score to spot weak topics.
  protected readonly bars = computed(() =>
    [...this.store.rows()]
      .sort(byPlanOrder)
      .map((r) => ({
        topic: r.topic,
        subtopics: r.subtopics ?? [], // resume-evidenced angles, shown on hover (not drill limits)
        score: r.rollingScore,
        tone: r.rollingScore <= 4 ? 'weak' : r.rollingScore <= 7 ? 'mid' : 'strong',
      })),
  );
}

// Map a reading to a display row. A validated estimate (level !== null) shows
// normally. Otherwise, if a resume baseline exists, show it as a provisional
// `estimate`; failing that it's genuinely "Not started"/"Calibrating…".
function view(est: LevelEstimate, baseline: Level | null) {
  if (est.level !== null) {
    return {
      calibrating: false,
      estimate: false,
      label: `${LEVEL_NAMES[est.level - 1]} · ${est.level}`,
      pct: Math.round(est.progressToNext * 100),
    };
  }
  if (baseline != null) {
    return { calibrating: true, estimate: true, label: `${LEVEL_NAMES[baseline - 1]} · ${baseline}`, pct: 0 };
  }
  const label = est.samples === 0 ? 'Not started' : 'Calibrating…';
  return { calibrating: true, estimate: false, label, pct: 0 };
}
