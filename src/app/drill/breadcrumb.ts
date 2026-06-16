import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';
import { type Mode } from '../models/types';
import { DrillSession } from '../services/drill-session';

// The four real screens, in flow order. The breadcrumb shows where you are and
// lets you click any COMPLETED step to go back (current/future steps are inert).
const STEPS: ReadonlyArray<{ label: string; path: string }> = [
  { label: 'Resume', path: '/' },
  { label: 'Mode', path: '/mode' },
  { label: 'Ready', path: '/ready' },
  { label: 'Drill', path: '/drill' },
];

// Display names for the picked mode, surfaced on the Mode step once chosen.
const MODE_LABELS: Record<Mode, string> = { interview: 'Interview', improve: 'Improve' };

@Component({
  selector: 'app-breadcrumb',
  imports: [],
  templateUrl: './breadcrumb.html',
})
export class Breadcrumb {
  private readonly router = inject(Router);
  private readonly session = inject(DrillSession);

  // Track the active URL reactively (router.url isn't a signal).
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  protected readonly steps = computed(() => {
    const current = this.url().split(/[?#]/)[0] || '/';
    const idx = STEPS.findIndex((s) => s.path === current);
    const currentIndex = idx === -1 ? 0 : idx;
    const mode = this.session.mode();
    return STEPS.map((s, i) => ({
      // Once a mode is picked, the Mode step carries it (e.g. "Mode: Interview").
      label: s.path === '/mode' && mode ? `${s.label}: ${MODE_LABELS[mode]}` : s.label,
      path: s.path,
      active: i === currentIndex,
      clickable: i < currentIndex, // only completed steps navigate back
    }));
  });

  protected go(path: string): void {
    void this.session.navigateToStep(path);
  }
}
