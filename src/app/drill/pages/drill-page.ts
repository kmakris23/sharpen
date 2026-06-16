import { Component, type OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Phase } from '../../models/types';
import { DrillSession } from '../../services/drill-session';
import { AnswerInput } from '../answer-input';
import { Conversation } from '../conversation';
import { LoadingIndicator } from '../loading-indicator';

// The transient phases that legitimately live on /drill.
const DRILL_PHASES = [Phase.Asking, Phase.Answering, Phase.Scoring, Phase.Feedback];

// Route 'drill' (ASKING/ANSWERING/SCORING/FEEDBACK): the conversation loop. The
// transient phases play out here via the session's `phase` signal — no routing.
@Component({
  selector: 'app-drill-page',
  imports: [Conversation, AnswerInput, LoadingIndicator],
  templateUrl: './drill-page.html',
})
export class DrillPage implements OnInit {
  protected readonly session = inject(DrillSession);
  private readonly router = inject(Router);

  ngOnInit(): void {
    // On a real reload the session resets to LANDING (mid-drill restore isn't built
    // yet) — fall back to /ready rather than show a blank drill. During the normal
    // start flow the phase is already a drill phase, so we stay put.
    if (!DRILL_PHASES.includes(this.session.phase())) {
      void this.router.navigate(['/ready']);
    }
  }
}
