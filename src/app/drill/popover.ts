import {
  Directive,
  ElementRef,
  HostListener,
  type OnDestroy,
  Renderer2,
  inject,
  input,
} from '@angular/core';

// A hover/focus popover that is PORTALED to <body> and positioned `fixed`, so it escapes
// every overflow/scroll/transform ancestor — it can't be clipped by a scrolling list or
// pushed off-screen the way an `absolute` tooltip is. It opens beside the trigger (left if
// there's room, else right) and is clamped to the viewport. Used for every tooltip (the EST
// badge, the subtopics list) so they all behave identically.
@Directive({ selector: '[appPopover]' })
export class Popover implements OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly r = inject(Renderer2);

  // Body content: a single string, or one entry per line.
  readonly content = input<string | readonly string[]>('', { alias: 'appPopover' });
  // Optional dimmed header rendered above the lines.
  readonly heading = input<string>('', { alias: 'popoverTitle' });

  private el: HTMLElement | null = null;
  private static readonly GAP = 8;

  @HostListener('mouseenter')
  @HostListener('focus')
  show(): void {
    const lines = this.lines();
    if (!lines.length || this.el) return;

    const pop = this.r.createElement('div') as HTMLElement;
    this.r.setAttribute(pop, 'role', 'tooltip');
    this.r.setAttribute(
      pop,
      'class',
      'pointer-events-none fixed z-50 w-52 rounded border border-neutral-700 bg-neutral-900 p-2 ' +
        'text-left text-[11px] font-normal leading-snug text-neutral-300 shadow-lg',
    );

    const title = this.heading().trim();
    if (title) {
      const h = this.r.createElement('div') as HTMLElement;
      this.r.setAttribute(h, 'class', 'mb-1 text-[10px] uppercase tracking-wide text-neutral-500');
      this.r.appendChild(h, this.r.createText(title));
      this.r.appendChild(pop, h);
    }
    for (const line of lines) {
      const row = this.r.createElement('div') as HTMLElement;
      this.r.appendChild(row, this.r.createText(line));
      this.r.appendChild(pop, row);
    }

    this.r.appendChild(document.body, pop);
    this.el = pop;
    this.place();
  }

  @HostListener('mouseleave')
  @HostListener('blur')
  hide(): void {
    if (!this.el) return;
    this.r.removeChild(document.body, this.el);
    this.el = null;
  }

  ngOnDestroy(): void {
    this.hide();
  }

  /** Normalize the content to trimmed, non-empty lines. */
  private lines(): string[] {
    const c = this.content();
    return (Array.isArray(c) ? c : [c]).map((s) => `${s}`.trim()).filter(Boolean);
  }

  /** Place the (already-rendered, so measurable) popover beside the trigger, clamped to the viewport. */
  private place(): void {
    const pop = this.el;
    if (!pop) return;
    const t = this.host.nativeElement.getBoundingClientRect();
    const gap = Popover.GAP;
    const w = pop.offsetWidth || 208; // w-52 fallback for jsdom (offsetWidth = 0)
    const h = pop.offsetHeight;
    // Prefer opening to the left of the trigger; fall back to the right; then clamp.
    let left = t.left - w - gap >= gap ? t.left - w - gap : t.right + gap;
    left = Math.max(gap, Math.min(left, window.innerWidth - w - gap));
    const top = Math.max(gap, Math.min(t.top + t.height / 2 - h / 2, window.innerHeight - h - gap));
    this.r.setStyle(pop, 'left', `${left}px`);
    this.r.setStyle(pop, 'top', `${top}px`);
  }
}
