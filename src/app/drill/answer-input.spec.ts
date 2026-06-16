import { TestBed } from '@angular/core/testing';
import { AnswerInput } from './answer-input';

describe('AnswerInput', () => {
  function make(enabled: boolean) {
    const fixture = TestBed.createComponent(AnswerInput);
    fixture.componentRef.setInput('enabled', enabled);
    fixture.detectChanges();
    return fixture;
  }

  it('disables textarea and button when not enabled', () => {
    const el = make(false).nativeElement as HTMLElement;
    expect((el.querySelector('textarea') as HTMLTextAreaElement).disabled).toBe(true);
    expect((el.querySelector('button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('does not emit when disabled, even if submit() is called', () => {
    const fixture = make(false);
    let emits = 0;
    fixture.componentInstance.send.subscribe(() => emits++);
    fixture.componentInstance.draft.set('an answer');
    fixture.componentInstance.submit();
    expect(emits).toBe(0);
  });

  it('emits trimmed text once and clears the draft', () => {
    const fixture = make(true);
    const sent: string[] = [];
    fixture.componentInstance.send.subscribe((t) => sent.push(t));
    fixture.componentInstance.draft.set('  my answer  ');
    fixture.componentInstance.submit();
    expect(sent).toEqual(['my answer']);
    expect(fixture.componentInstance.draft()).toBe('');
  });

  it('ignores empty/whitespace submissions', () => {
    const fixture = make(true);
    let emits = 0;
    fixture.componentInstance.send.subscribe(() => emits++);
    fixture.componentInstance.draft.set('   ');
    fixture.componentInstance.submit();
    expect(emits).toBe(0);
  });
});
