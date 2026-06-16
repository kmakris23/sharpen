import { TestBed } from '@angular/core/testing';
import { StartGate } from './start-gate';

describe('StartGate', () => {
  function make(mode: 'interview' | 'improve', canStart: boolean) {
    const fixture = TestBed.createComponent(StartGate);
    fixture.componentRef.setInput('mode', mode);
    fixture.componentRef.setInput('canStart', canStart);
    fixture.detectChanges();
    return fixture;
  }

  it('disables Start without a key', () => {
    const fixture = make('improve', false);
    const btn = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('enables Start and emits when a key is present', () => {
    const fixture = make('improve', true);
    let started = false;
    fixture.componentInstance.start.subscribe(() => (started = true));
    const btn = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    btn.click();
    expect(started).toBe(true);
  });

  it('shows a mode-specific blurb', () => {
    expect((make('improve', true).nativeElement.textContent as string)).toContain('Improve mode');
    expect((make('interview', true).nativeElement.textContent as string)).toContain('Interview mode');
  });
});
