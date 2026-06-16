import { TestBed } from '@angular/core/testing';
import { LoadingIndicator } from './loading-indicator';

describe('LoadingIndicator', () => {
  function render(label?: string) {
    const fixture = TestBed.createComponent(LoadingIndicator);
    if (label !== undefined) fixture.componentRef.setInput('label', label);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows the given label', () => {
    expect(render('Scoring your answer…').textContent).toContain('Scoring your answer…');
  });

  it('exposes a polite live status for screen readers', () => {
    const status = render().querySelector('[role="status"]');
    expect(status?.getAttribute('aria-live')).toBe('polite');
  });
});
