import { type Profile } from '../models/types';
import { ResumeStore } from './resume-store';

const profile: Profile = {
  summary: 'Angular + .NET dev',
  topics: [{ topic: 'Angular: change detection', cat: 'frontend' }],
  resumeLevel: 3,
};

describe('ResumeStore', () => {
  beforeEach(() => localStorage.clear());

  it('returns null when nothing is saved', () => {
    expect(new ResumeStore().load()).toBeNull();
  });

  it('round-trips a saved resume', () => {
    const store = new ResumeStore();
    store.save(profile, 'resume.pdf');
    const loaded = new ResumeStore().load(); // fresh instance reads localStorage
    expect(loaded?.name).toBe('resume.pdf');
    expect(loaded?.profile.summary).toBe('Angular + .NET dev');
  });

  it('clears the saved resume', () => {
    const store = new ResumeStore();
    store.save(profile, 'resume.pdf');
    store.clear();
    expect(store.load()).toBeNull();
  });

  it('ignores malformed data', () => {
    localStorage.setItem('sharpen.resume', '{not valid');
    expect(new ResumeStore().load()).toBeNull();
    localStorage.setItem('sharpen.resume', JSON.stringify({ profile: { topics: 'nope' } }));
    expect(new ResumeStore().load()).toBeNull();
  });
});
