import { Component, input } from '@angular/core';

// A small inline spinner + label. Shown during the async phases (asking a
// question, scoring an answer) so the wait reads as work-in-progress rather than
// a frozen screen. Dumb — just renders the label it's given.
@Component({
  selector: 'app-loading-indicator',
  templateUrl: './loading-indicator.html',
})
export class LoadingIndicator {
  readonly label = input<string>('Loading…');
}
