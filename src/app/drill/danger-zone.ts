import { Component, type ElementRef, inject, viewChild } from '@angular/core';
import { DrillSession } from '../services/drill-session';

// The reset control: a low-key danger link that opens a confirmation dialog before
// wiping everything (mastery DB, resume, mode, API key) and returning to the start.
@Component({
  selector: 'app-danger-zone',
  templateUrl: './danger-zone.html',
})
export class DangerZone {
  private readonly session = inject(DrillSession);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  open(): void {
    this.dialog().nativeElement.showModal?.();
  }

  cancel(): void {
    this.dialog().nativeElement.close?.();
  }

  /** Clear drill progress + level only, keeping the resume and Claude key. */
  async confirmProgress(): Promise<void> {
    this.dialog().nativeElement.close?.();
    await this.session.resetProgress();
  }

  /** Wipe everything, including the resume and Claude key. */
  async confirmAll(): Promise<void> {
    this.dialog().nativeElement.close?.();
    await this.session.resetAll();
  }
}
