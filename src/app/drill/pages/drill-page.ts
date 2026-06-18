import { Component, type OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
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
  private readonly route = inject(ActivatedRoute);

  ngOnInit(): void {
    // On reload, the session restores an in-flight drill (DrillSession.init) into a
    // drill phase. With nothing to restore we land here outside a drill phase — fall
    // back to /ready rather than show a blank drill.
    if (!DRILL_PHASES.includes(this.session.phase())) {
      void this.router.navigate(['/ready']);
      return;
    }
    // Keep the URL honest: if the path's :n doesn't match the restored question
    // (e.g. a reload caught mid-generation, or a hand-edited URL), correct it.
    const n = this.session.questionNumber();
    const param = Number(this.route.snapshot.paramMap.get('n'));
    if (n > 0 && param !== n) void this.router.navigate(['/drill', n]);
  }
}
