import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { DrillSession } from '../../services/drill-session';
import { LlmService } from '../../services/llm.service';
import { MasteryStore } from '../../services/mastery.store';
import { ResumeStore } from '../../services/resume-store';
import { LandingPage } from './landing-page';

class FakeLlm {
  keyVal = 'sk-ant-k';
  key = () => this.keyVal;
  hasKey = () => this.keyVal.length > 0;
  setKey(k: string): void {
    this.keyVal = k;
  }
}
class FakeStore {
  rows = signal([]).asReadonly();
  async load() {
    return [];
  }
}
class FakeResume {
  load() {
    return null;
  }
  save(): void {}
  clear(): void {}
}
class FakeRouter {
  navigate() {
    return Promise.resolve(true);
  }
}

describe('LandingPage', () => {
  function setup() {
    TestBed.configureTestingModule({
      providers: [
        DrillSession,
        { provide: LlmService, useValue: new FakeLlm() },
        { provide: MasteryStore, useValue: new FakeStore() },
        { provide: ResumeStore, useValue: new FakeResume() },
        { provide: Router, useValue: new FakeRouter() },
      ],
    });
    const fixture = TestBed.createComponent(LandingPage);
    const session = TestBed.inject(DrillSession);
    return { fixture, session };
  }

  it('shows the uploader when no resume is on file', () => {
    const { fixture } = setup();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-upload-pane')).not.toBeNull();
  });

  it('shows the "resume on file" card with name and Continue when a resume exists', () => {
    const { fixture, session } = setup();
    session.profile.set({ summary: 'Angular dev', topics: [], resumeLevel: 3 });
    session.resumeName.set('jane.pdf');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-upload-pane')).toBeNull();
    expect(el.textContent).toContain('resume on file');
    expect(el.textContent).toContain('jane.pdf');
    expect(el.textContent).toContain('Angular dev');
    expect(el.textContent).toContain('Continue');
  });
});
