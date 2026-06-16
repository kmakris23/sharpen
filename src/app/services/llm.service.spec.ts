import { LlmService } from './llm.service';

describe('LlmService — key plumbing', () => {
  beforeEach(() => localStorage.clear());

  it('starts with no key', () => {
    const llm = new LlmService();
    expect(llm.hasKey()).toBe(false);
    expect(llm.key()).toBe('');
  });

  it('sets, trims, and exposes the key reactively', () => {
    const llm = new LlmService();
    llm.setKey('  sk-ant-abc  ');
    expect(llm.key()).toBe('sk-ant-abc');
    expect(llm.hasKey()).toBe(true);
  });

  it('persists across instances (survives refresh)', () => {
    new LlmService().setKey('sk-ant-xyz');
    expect(new LlmService().key()).toBe('sk-ant-xyz'); // fresh instance reads localStorage
  });

  it('clears the key', () => {
    const llm = new LlmService();
    llm.setKey('sk-ant-xyz');
    llm.setKey('');
    expect(llm.hasKey()).toBe(false);
    expect(new LlmService().key()).toBe(''); // cleared from storage too
  });
});
