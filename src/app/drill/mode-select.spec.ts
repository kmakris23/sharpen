import { TestBed } from '@angular/core/testing';
import { type Mode } from '../models/types';
import { ModeSelect } from './mode-select';

describe('ModeSelect', () => {
  function make() {
    const fixture = TestBed.createComponent(ModeSelect);
    fixture.detectChanges();
    return fixture;
  }

  it('emits the chosen mode for each card', () => {
    const fixture = make();
    const picks: Mode[] = [];
    fixture.componentInstance.modeSelected.subscribe((m) => picks.push(m));

    const buttons = fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>;
    buttons[0].click(); // Interview
    buttons[1].click(); // Improve

    expect(picks).toEqual(['interview', 'improve']);
  });

  it('pre-highlights the previously selected mode', () => {
    const fixture = TestBed.createComponent(ModeSelect);
    fixture.componentRef.setInput('selected', 'improve');
    fixture.detectChanges();

    const buttons = fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>;
    expect(buttons[0].getAttribute('aria-pressed')).toBe('false'); // Interview
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true'); // Improve preselected
    expect(buttons[1].classList).toContain('border-accent');
  });
});
