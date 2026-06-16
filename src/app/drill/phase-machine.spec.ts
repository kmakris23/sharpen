import { Phase } from '../models/types';
import { ALLOWED_NEXT, canTransition } from './phase-machine';

describe('phase-machine', () => {
  it('allows each phase its single legal successor', () => {
    expect(canTransition(Phase.Landing, Phase.Parsing)).toBe(true);
    expect(canTransition(Phase.Answering, Phase.Scoring)).toBe(true);
    expect(canTransition(Phase.Feedback, Phase.Asking)).toBe(true); // loop
  });

  it('rejects illegal transitions', () => {
    expect(canTransition(Phase.Landing, Phase.Scoring)).toBe(false);
    expect(canTransition(Phase.Scoring, Phase.Answering)).toBe(false); // no going back
    expect(canTransition(Phase.Answering, Phase.Feedback)).toBe(false); // must score first
  });

  it('walks the full cycle in order, then loops Feedback -> Asking', () => {
    const order = [
      Phase.Landing,
      Phase.Parsing,
      Phase.Mode,
      Phase.Ready,
      Phase.Asking,
      Phase.Answering,
      Phase.Scoring,
      Phase.Feedback,
    ];
    let p = Phase.Landing;
    const visited: Phase[] = [p];
    for (let i = 0; i < order.length; i++) {
      p = ALLOWED_NEXT[p];
      visited.push(p);
    }
    expect(visited).toEqual([...order, Phase.Asking]); // 8 phases reached, then loop
  });
});
