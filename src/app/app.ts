import { Component, type OnInit, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Breadcrumb } from './drill/breadcrumb';
import { DangerZone } from './drill/danger-zone';
import { MasteryPanel } from './drill/mastery-panel';
import { DrillSession } from './services/drill-session';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, MasteryPanel, Breadcrumb, DangerZone],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  protected readonly title = signal('sharpen');
  protected readonly session = inject(DrillSession);

  ngOnInit(): void {
    this.session.init(); // load persisted mastery + saved resume
  }
}
