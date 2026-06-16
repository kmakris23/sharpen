import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { DrillSession } from '../services/drill-session';
import { DangerZone } from './danger-zone';

function render() {
  const resetAll = vi.fn().mockResolvedValue(undefined);
  const resetProgress = vi.fn().mockResolvedValue(undefined);
  TestBed.configureTestingModule({
    providers: [{ provide: DrillSession, useValue: { resetAll, resetProgress } }],
  });
  const fixture = TestBed.createComponent(DangerZone);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const trigger = el.querySelector('button')!; // the panel control (first button)
  const dialog = el.querySelector('dialog')!;
  const inDialog = (text: string) =>
    [...dialog.querySelectorAll('button')].find((b) => b.textContent?.includes(text));
  return { el, resetAll, resetProgress, trigger, inDialog };
}

describe('DangerZone', () => {
  it('renders the reset control', () => {
    expect(render().trigger.textContent).toContain('Reset progress');
  });

  it('does not reset anything just by opening the dialog', () => {
    const { trigger, resetAll, resetProgress } = render();
    trigger.click();
    expect(resetAll).not.toHaveBeenCalled();
    expect(resetProgress).not.toHaveBeenCalled();
  });

  it('resets progress (keeps key/resume) on the primary action', () => {
    const { inDialog, resetAll, resetProgress } = render();
    inDialog('Reset progress')!.click();
    expect(resetProgress).toHaveBeenCalled();
    expect(resetAll).not.toHaveBeenCalled();
  });

  it('wipes everything via the secondary "Delete everything" action', () => {
    const { inDialog, resetAll, resetProgress } = render();
    inDialog('Delete everything')!.click();
    expect(resetAll).toHaveBeenCalled();
    expect(resetProgress).not.toHaveBeenCalled();
  });
});
