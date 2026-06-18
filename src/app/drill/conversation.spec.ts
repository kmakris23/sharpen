import { TestBed } from '@angular/core/testing';
import { type ChatMessage } from '../models/types';
import { Conversation } from './conversation';

describe('Conversation', () => {
  function render(messages: ChatMessage[]) {
    const fixture = TestBed.createComponent(Conversation);
    fixture.componentRef.setInput('messages', messages);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders question and answer text', () => {
    const el = render([
      { id: '1', role: 'assistant', text: 'What is change detection?' },
      { id: '2', role: 'user', text: 'It checks bindings.' },
    ]);
    expect(el.textContent).toContain('What is change detection?');
    expect(el.textContent).toContain('It checks bindings.');
  });

  it('renders a feedback result with score, lists, one-liner, terms, and teaching', () => {
    const el = render([
      {
        id: '3',
        role: 'feedback',
        result: {
          score: 4,
          strengths: ['mentioned zones'],
          weaknesses: ['missed OnPush'],
          articulationNote: 'be precise',
          oneLiner: 'OnPush turns the component into a pure function of its inputs',
          termsThatScore: ['OnPush', 'reference equality', 'markForCheck'],
          teaching: 'OnPush skips subtrees…',
        },
      },
    ]);
    expect(el.textContent).toContain('4/10');
    expect(el.textContent).toContain('mentioned zones');
    expect(el.textContent).toContain('missed OnPush');
    expect(el.textContent).toContain('pure function of its inputs');
    expect(el.textContent).toContain('markForCheck');
    expect(el.textContent).toContain('OnPush skips subtrees');
  });
});
