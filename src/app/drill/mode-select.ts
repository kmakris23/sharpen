import { Component, input, output } from '@angular/core';
import { type Mode } from '../models/types';

// MODE: two mode cards. Dumb — emits the chosen Mode; parent (Drill) stores it
// and advances to READY. `selected` pre-highlights a card so returning to this
// step (via the breadcrumb) shows the previously picked mode.
@Component({
  selector: 'app-mode-select',
  templateUrl: './mode-select.html',
})
export class ModeSelect {
  readonly selected = input<Mode | null>(null);
  readonly modeSelected = output<Mode>();

  pick(mode: Mode): void {
    this.modeSelected.emit(mode);
  }
}
