import { inject } from '@angular/core';
import { type CanActivateFn, Router, type Routes } from '@angular/router';
import { DrillPage } from './drill/pages/drill-page';
import { LandingPage } from './drill/pages/landing-page';
import { ModePage } from './drill/pages/mode-page';
import { ReadyPage } from './drill/pages/ready-page';
import { DrillSession } from './services/drill-session';

// Session state is ephemeral (only mastery persists), so a refresh/deep-link onto
// a later screen has no profile/mode -> these guards redirect back to LANDING.
const hasProfile: CanActivateFn = () =>
  inject(DrillSession).hasProfile() || inject(Router).createUrlTree(['/']);

const canDrill: CanActivateFn = () =>
  inject(DrillSession).canDrill() || inject(Router).createUrlTree(['/']);

export const routes: Routes = [
  { path: '', component: LandingPage },
  { path: 'mode', component: ModePage, canActivate: [hasProfile] },
  { path: 'ready', component: ReadyPage, canActivate: [canDrill] },
  { path: 'drill', component: DrillPage, canActivate: [canDrill] },
  { path: '**', redirectTo: '' },
];
