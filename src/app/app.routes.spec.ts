import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';

describe('routing + guards', () => {
  async function harness() {
    TestBed.configureTestingModule({ providers: [provideRouter(routes)] });
    return RouterTestingHarness.create();
  }

  it('renders the landing upload pane at /', async () => {
    const h = await harness();
    await h.navigateByUrl('/');
    expect((h.routeNativeElement as HTMLElement).querySelector('app-upload-pane')).not.toBeNull();
  });

  it('redirects /drill back to / when there is no session (guard)', async () => {
    const h = await harness();
    await h.navigateByUrl('/drill');
    expect(TestBed.inject(Router).url).toBe('/');
  });

  it('redirects /mode back to / without a parsed resume (guard)', async () => {
    const h = await harness();
    await h.navigateByUrl('/mode');
    expect(TestBed.inject(Router).url).toBe('/');
  });
});
