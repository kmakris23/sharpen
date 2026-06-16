import { Component, input, output } from '@angular/core';
import { type Mode } from '../models/types';

// READY: the Start gate. Dumb — shows a mode-specific blurb and emits `start`.
// Start is disabled until a key is present (canStart), per SPEC.
@Component({
  selector: 'app-start-gate',
  templateUrl: './start-gate.html',
})
export class StartGate {
  readonly mode = input.required<Mode>();
  readonly canStart = input<boolean>(false);
  readonly start = output<void>();
}
