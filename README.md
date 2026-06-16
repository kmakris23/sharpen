<div align="center">

<img src="public/logo.svg" alt="sharpen" width="420" />

**Adaptive technical interview drill — your résumé in, level-appropriate questions out.**

Upload a résumé, pick a mode, and answer focused technical questions one at a time.
Every answer is scored, weak spots resurface, and a live mastery panel tracks you from
Junior to Principal — all in the browser, with your own Claude key.

</div>

---

## What it is

**sharpen** turns your résumé into a personalized technical drill. It reads the technologies
you actually use, asks one focused question at a time, scores each answer 0–10 with concrete
strengths and weaknesses, and keeps a running picture of where you're strong and where you're
not. Interview prep is the hook; **getting measurably better is the product.**

It runs entirely in your browser. There's no server and no account — you bring your own
[Claude API key](https://console.anthropic.com/), and your résumé and progress never leave
your machine.

## Features

- **Résumé-driven topics** — parsing extracts the *base* technologies from your résumé
  (e.g. `Angular`, `Postgres`, `Kubernetes`) and groups them into categories. The specific
  angles it found (SignalR, change detection, indexing…) are kept as reference hints, shown on
  hover — but questions range across the *whole* topic, never just those angles.
- **Two modes** — **Interview** (broad coverage, debrief-style feedback) and **Improve**
  (leans hard on your weak topics, with a teaching block on weak answers).
- **Level-appropriate questions** — difficulty adapts to where you actually are, not a fixed
  seniority assumption.
- **0–10 scoring** — each answer comes back with strengths, weaknesses, and an
  articulation note on the precision of your wording.
- **Live mastery panel** — per-topic score bars (weak → amber → strong), per-category levels,
  and an overall **seniority level** (Junior → Principal) with a "% to next" progress bar that
  recomputes after every answer.
- **Smart resurfacing** — a count-based scheduler brings weak and overdue topics back around;
  early questions spread across categories to calibrate your level with breadth.
- **Survives refresh** — your parsed résumé, mastery, and key persist locally, so you upload
  once and pick up where you left off.

## How it works

```
Upload résumé  →  Parse (Claude)  →  Pick a mode  →  Start
                                                        │
                        ┌───────────────────────────────┘
                        ▼
        ┌──►  Ask a question  →  Answer  →  Score + feedback  ──┐
        │         (scheduler picks the next topic)              │
        └───────────────────────────────────────────────────────┘
```

A single phase state machine drives the UI, and the answer box is enabled **only** while a
question is waiting — so you can never double-submit. Three Claude calls do all the heavy
lifting: parse the résumé, generate each question, and score each answer.

## Getting started

**Prerequisites:** [Node.js](https://nodejs.org/) 20+, [pnpm](https://pnpm.io/), and a
[Claude API key](https://console.anthropic.com/).

```bash
pnpm install
pnpm start
```

Open <http://localhost:4200/>, paste your Claude API key when prompted, and upload a résumé
(PDF, DOCX, or plain text). That's it.

> **Your key stays in your browser.** It's held in memory and `localStorage` so it survives a
> refresh, and it's sent directly to Anthropic from your machine — it is never committed,
> logged, or proxied through any server. (This client-side model is great for personal use; a
> hosted, multi-user deployment would move the key behind a server proxy.)

## Scripts

```bash
pnpm start                  # dev server (ng serve) at http://localhost:4200/
pnpm build                  # production build → dist/
pnpm exec ng test --no-watch  # run the unit suite once (Vitest)
```

## Tech stack

- **Angular 20** — standalone components, signals, new control flow (`@if` / `@for`)
- **TypeScript** (strict)
- **Tailwind CSS v4** (CSS-first `@theme`)
- **Claude** (`claude-opus-4-8`) via the Messages API, browser-direct with your key
- **Vitest** + jsdom for tests, **IndexedDB** + `localStorage` for persistence
- **pdfjs-dist** / **mammoth** for PDF & DOCX text extraction (lazy-loaded)

## Project structure

```
src/app/
  app.{ts,html}          shell: header + <router-outlet> + mastery panel
  app.routes.ts          routes + guards ( / , /mode , /ready , /drill )
  drill/                 UI: pages + dumb components (upload, mode, conversation,
                         answer input, mastery panel, popover, …)
  models/types.ts        shared types
  services/
    drill-session.ts     session state + orchestration
    llm.service.ts        the "backend": parse / question / score (3 Claude calls)
    scheduler.ts          resurfacing + leveling (pure functions)
    mastery.store.ts      IndexedDB persistence + reactive rows
    resume-store.ts       persists the parsed résumé
    resume-extract.ts     PDF / DOCX / text extraction
```

## Privacy

Everything runs locally. Your résumé is parsed in the browser and the extracted text is sent
only to Anthropic to generate questions and scores. Nothing is stored on a server; clearing
your browser data (or the in-app **Reset** controls) wipes it completely.

## License

See repository settings.
