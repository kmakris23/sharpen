import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { EMPTY } from 'rxjs';
import { vi } from 'vitest';
import { type Mode } from '../models/types';
import { DrillSession } from '../services/drill-session';
import { Breadcrumb } from './breadcrumb';

// Router stub: a fixed url + an empty events stream (toSignal keeps the initial value).
function render(url: string, mode: Mode | null = null) {
  const navigateToStep = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      { provide: Router, useValue: { url, events: EMPTY } },
      { provide: DrillSession, useValue: { navigateToStep, mode: signal(mode) } },
    ],
  });
  const fixture = TestBed.createComponent(Breadcrumb);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, navigateToStep };
}

describe('Breadcrumb', () => {
  it('renders all four steps', () => {
    const { el } = render('/');
    for (const label of ['Resume', 'Mode', 'Ready', 'Drill']) {
      expect(el.textContent).toContain(label);
    }
  });

  it('marks the current step and makes only earlier steps clickable', () => {
    const { el } = render('/ready');
    // Earlier steps (Resume, Mode) are buttons; current/future are not.
    const buttons = [...el.querySelectorAll('button')].map((b) => b.textContent?.trim());
    expect(buttons).toEqual(['Resume', 'Mode']);
    // The current step is marked.
    expect(el.querySelector('[aria-current="step"]')?.textContent?.trim()).toBe('Ready');
  });

  it('shows the picked mode on the Mode step', () => {
    const { el } = render('/ready', 'interview');
    expect(el.textContent).toContain('Mode: Interview');
  });

  it('shows a plain Mode label before a mode is picked', () => {
    const { el } = render('/', null);
    const labels = [...el.querySelectorAll('span, button')].map((n) => n.textContent?.trim());
    expect(labels).toContain('Mode');
    expect(el.textContent).not.toContain('Mode:');
  });

  it('navigates back when a completed step is clicked', () => {
    const { el, navigateToStep } = render('/ready');
    const mode = [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Mode'));
    mode!.click();
    expect(navigateToStep).toHaveBeenCalledWith('/mode');
  });
});
