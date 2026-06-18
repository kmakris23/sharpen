import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { vi } from 'vitest';
import { Phase } from '../../models/types';
import { DrillSession } from '../../services/drill-session';
import { DrillPage } from './drill-page';

// Render with the template stripped — we only exercise the ngOnInit reload guard.
// `param` is the /drill/:n value in the URL; `questionNumber` is the restored question.
function render(phase: Phase, questionNumber = 0, param: string | null = null) {
  const navigate = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      { provide: DrillSession, useValue: { phase: signal(phase), questionNumber: signal(questionNumber) } },
      { provide: Router, useValue: { navigate } },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => param } } } },
    ],
  });
  TestBed.overrideComponent(DrillPage, { set: { template: '', imports: [] } });
  TestBed.createComponent(DrillPage).detectChanges(); // fires ngOnInit
  return navigate;
}

describe('DrillPage reload guard', () => {
  it('stays put while asking (normal start flow)', () => {
    expect(render(Phase.Asking)).not.toHaveBeenCalled();
  });

  it('stays put while answering when the URL matches the question', () => {
    expect(render(Phase.Answering, 2, '2')).not.toHaveBeenCalled();
  });

  it('redirects to /ready when reloaded outside a drill phase', () => {
    expect(render(Phase.Landing)).toHaveBeenCalledWith(['/ready']);
  });

  it('corrects the URL when :n disagrees with the restored question', () => {
    // Reload caught mid-generation: URL says /drill/3 but the restored question is 2.
    expect(render(Phase.Feedback, 2, '3')).toHaveBeenCalledWith(['/drill', 2]);
  });
});
