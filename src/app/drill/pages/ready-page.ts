import { Component, inject } from '@angular/core';
import { DrillSession } from '../../services/drill-session';
import { LlmService } from '../../services/llm.service';
import { StartGate } from '../start-gate';

// Route 'ready' (READY): the Start gate.
@Component({
  selector: 'app-ready-page',
  imports: [StartGate],
  templateUrl: './ready-page.html',
})
export class ReadyPage {
  protected readonly session = inject(DrillSession);
  protected readonly llm = inject(LlmService);
}
