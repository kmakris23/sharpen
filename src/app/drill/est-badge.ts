import { Component } from '@angular/core';
import { Popover } from './popover';

// The "EST" chip shown next to a provisional, resume-derived level. Hovering (or
// focusing) it reveals what "estimate" means via the shared viewport-fixed popover
// (so it can't be clipped). Used wherever a not-yet-validated reading is rendered
// (overall level + per-category levels).
@Component({
  selector: 'app-est-badge',
  imports: [Popover],
  templateUrl: './est-badge.html',
})
export class EstBadge {}
