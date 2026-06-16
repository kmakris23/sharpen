import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { vi } from 'vitest';
import { Phase } from '../../models/types';
import { DrillSession } from '../../services/drill-session';
import { DrillPage } from './drill-page';

// Render with the template stripped — we only exercise the ngOnInit reload guard.
function render(phase: Phase) {
  const navigate = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      { provide: DrillSession, useValue: { phase: signal(phase) } },
      { provide: Router, useValue: { navigate } },
    ],
  });
  TestBed.overrideComponent(DrillPage, { set: { template: '', imports: [] } });
  TestBed.createComponent(DrillPage).detectChanges(); // fires ngOnInit
  return navigate;
}

describe('DrillPage reload guard', () => {
  it('stays on /drill while asking (normal start flow)', () => {
    expect(render(Phase.Asking)).not.toHaveBeenCalled();
  });

  it('stays on /drill while answering', () => {
    expect(render(Phase.Answering)).not.toHaveBeenCalled();
  });

  it('redirects to /ready when reloaded outside a drill phase', () => {
    expect(render(Phase.Landing)).toHaveBeenCalledWith(['/ready']);
  });
});
