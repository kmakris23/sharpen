import { Component, inject } from '@angular/core';
import { DrillSession } from '../../services/drill-session';
import { ModeSelect } from '../mode-select';

// Route 'mode' (MODE): pick Interview or Improve.
@Component({
  selector: 'app-mode-page',
  imports: [ModeSelect],
  templateUrl: './mode-page.html',
})
export class ModePage {
  protected readonly session = inject(DrillSession);
}
