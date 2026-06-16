// The phase machine — the spine of the UI (SPEC §Phase State Machine).
// The flow is a single cycle: each phase has exactly ONE legal successor, so
// strictness is structural — you can only ever move to the allowed next phase.

import { Phase } from '../models/types';

export const ALLOWED_NEXT: Readonly<Record<Phase, Phase>> = {
  [Phase.Landing]: Phase.Parsing,
  [Phase.Parsing]: Phase.Mode,
  [Phase.Mode]: Phase.Ready,
  [Phase.Ready]: Phase.Asking,
  [Phase.Asking]: Phase.Answering,
  [Phase.Answering]: Phase.Scoring,
  [Phase.Scoring]: Phase.Feedback,
  [Phase.Feedback]: Phase.Asking, // loop: Next question
};

/** True only for the single legal edge out of `from`. */
export function canTransition(from: Phase, to: Phase): boolean {
  return ALLOWED_NEXT[from] === to;
}
