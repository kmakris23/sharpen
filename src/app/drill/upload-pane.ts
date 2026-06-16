import { Component, computed, input, output, signal } from '@angular/core';

// LANDING: centered resume upload + Claude-key entry. Dumb component — the key
// value comes in via input, changes go out via outputs; the parent (Drill)
// persists the key through LlmService. No chat input here.
//
// Choosing a file STAGES it (doesn't parse yet): the user enters their key, then
// clicks Continue to kick off parsing. This avoids auto-advancing the moment a
// file lands, and lets them swap the file or fix the key first.
@Component({
  selector: 'app-upload-pane',
  templateUrl: './upload-pane.html',
})
export class UploadPane {
  readonly key = input<string>('');
  readonly error = input<string>('');
  readonly loading = input<boolean>(false); // parent is parsing the submitted resume
  readonly keyChange = output<string>();
  readonly fileSelected = output<File>();

  /** The chosen-but-not-yet-submitted resume. Null until a file is picked/dropped. */
  readonly staged = signal<File | null>(null);

  /** Continue is allowed once a file is staged AND a key is present, and not mid-parse. */
  readonly canContinue = computed(
    () => this.staged() !== null && this.key().trim().length > 0 && !this.loading(),
  );

  onFileInput(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) this.staged.set(file);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (file) this.staged.set(file);
  }

  onKeyInput(event: Event): void {
    this.keyChange.emit((event.target as HTMLInputElement).value);
  }

  /** Submit the staged file for parsing — only fires the explicit Continue action. */
  continue(): void {
    const file = this.staged();
    if (file && this.canContinue()) this.fileSelected.emit(file);
  }
}
