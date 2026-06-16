import { Component, input } from '@angular/core';
import { type ChatMessage } from '../models/types';

// The message list: questions (assistant/topic), the user's answers, and
// feedback (score + strengths/weaknesses/articulation + teaching). Dumb — renders
// the messages it's given. Role is a string union, safe to compare in-template.
@Component({
  selector: 'app-conversation',
  templateUrl: './conversation.html',
})
export class Conversation {
  readonly messages = input<ChatMessage[]>([]);
}
