import { TestBed } from '@angular/core/testing';
import { UploadPane } from './upload-pane';

describe('UploadPane', () => {
  function make() {
    const fixture = TestBed.createComponent(UploadPane);
    fixture.detectChanges();
    return fixture;
  }

  function chooseFile(fixture: ReturnType<typeof make>, file: File) {
    const input = fixture.nativeElement.querySelector('input[type=file]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  it('stages a chosen file (shows its name) without emitting yet', () => {
    const fixture = make();
    const file = new File(['cv'], 'resume.pdf', { type: 'application/pdf' });
    let emitted: File | undefined;
    fixture.componentInstance.fileSelected.subscribe((f) => (emitted = f));

    chooseFile(fixture, file);

    expect(emitted).toBeUndefined(); // no auto-continue on upload
    expect(fixture.nativeElement.textContent as string).toContain('resume.pdf');
  });

  it('emits fileSelected only when Continue is clicked (file staged + key present)', () => {
    const fixture = TestBed.createComponent(UploadPane);
    fixture.componentRef.setInput('key', 'sk-ant-123');
    fixture.detectChanges();
    const file = new File(['cv'], 'resume.pdf', { type: 'application/pdf' });
    let emitted: File | undefined;
    fixture.componentInstance.fileSelected.subscribe((f) => (emitted = f));

    chooseFile(fixture, file);
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(button.disabled).toBe(false); // file + key -> enabled
    button.click();

    expect(emitted).toBe(file);
  });

  it('shows a parsing state and disables Continue while loading', () => {
    const fixture = TestBed.createComponent(UploadPane);
    fixture.componentRef.setInput('key', 'sk-ant-123');
    fixture.detectChanges();
    chooseFile(fixture, new File(['cv'], 'resume.pdf'));

    const button = () => fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(button().disabled).toBe(false); // ready before parsing

    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();
    expect(button().disabled).toBe(true); // no double-submit mid-parse
    expect(button().textContent as string).toContain('Parsing');
  });

  it('keeps Continue disabled until both a file and a key are present', () => {
    const fixture = make(); // no key
    const button = () => fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(button().disabled).toBe(true); // nothing staged, no key

    chooseFile(fixture, new File(['cv'], 'resume.pdf'));
    expect(button().disabled).toBe(true); // file staged but still no key
  });

  it('emits keyChange when the key field changes', () => {
    const fixture = make();
    let emitted: string | undefined;
    fixture.componentInstance.keyChange.subscribe((k) => (emitted = k));

    const input = fixture.nativeElement.querySelector('input[type=password]') as HTMLInputElement;
    input.value = 'sk-ant-123';
    input.dispatchEvent(new Event('input'));

    expect(emitted).toBe('sk-ant-123');
  });

  it('prefills the key field from the key input', () => {
    const fixture = TestBed.createComponent(UploadPane);
    fixture.componentRef.setInput('key', 'sk-ant-existing');
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input[type=password]') as HTMLInputElement;
    expect(input.value).toBe('sk-ant-existing');
  });

  it('renders no chat/answer input on landing', () => {
    const fixture = make();
    expect(fixture.nativeElement.querySelector('textarea')).toBeNull();
  });

  it('shows an error message when the error input is set', () => {
    const fixture = TestBed.createComponent(UploadPane);
    fixture.componentRef.setInput('error', 'Unsupported file — upload a PDF, DOCX, or text resume.');
    fixture.detectChanges();
    expect((fixture.nativeElement.textContent as string)).toContain('Unsupported file');
  });
});
