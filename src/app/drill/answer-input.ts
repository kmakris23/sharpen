import { Component, input, output, signal } from '@angular/core';

// The answer textarea + send. THE INPUT RULE: enabled only when the parent says
// so (phase === Answering). On submit it emits once and clears; the parent
// immediately transitions Answering -> Scoring, so a second submit can't fire.
@Component({
  selector: 'app-answer-input',
  templateUrl: './answer-input.html',
})
export class AnswerInput {
  readonly enabled = input.required<boolean>();
  readonly send = output<string>();
  readonly draft = signal('');

  submit(): void {
    const text = this.draft().trim();
    if (!text || !this.enabled()) return;
    this.send.emit(text);
    this.draft.set('');
  }
}
