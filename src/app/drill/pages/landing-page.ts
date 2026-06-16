import { Component, inject } from '@angular/core';
import { DrillSession } from '../../services/drill-session';
import { LlmService } from '../../services/llm.service';
import { UploadPane } from '../upload-pane';

// Route '' (LANDING): a saved resume shows an "on file" card (upload once); else
// the uploader. The Claude key lives in the uploader, or a compact field on the
// card when a resume is on file but the key is missing.
@Component({
  selector: 'app-landing-page',
  imports: [UploadPane],
  templateUrl: './landing-page.html',
})
export class LandingPage {
  protected readonly session = inject(DrillSession);
  protected readonly llm = inject(LlmService);

  onKey(event: Event): void {
    this.llm.setKey((event.target as HTMLInputElement).value);
  }
}
