# TacticalMelee Testing Strategy Recommendation

**Version:** 1.0  
**Date:** 2026-05-07  
**Audience:** Developer / Claude Code skill authors  
**Status:** Draft — pending open-question resolution before implementation

---

## 1. Executive Summary

The recommended stack layers three testing tiers across the application's process boundary. Vitest handles everything that can run without a live Electron process (pure logic, XState actors, React components). Playwright with the official Electron launch API covers end-to-end integration across both renderer and main processes. Visual regression is handled by Playwright's built-in screenshot comparison, which uses pixelmatch internally and requires no additional dependency.

| Tool | Purpose | Why Chosen |
|------|---------|-----------|
| **Vitest** | Unit tests (XState actors, pure functions), component tests (React, via jsdom) | Native Vite integration — zero extra config; fastest runner for this stack; built-in JSON/JUnit reporters; workspace/projects feature for multi-environment setups |
| **React Testing Library** | Component-level tests for renderer UI | Pairs directly with Vitest; behaviour-first, not implementation-detail-focused; actively maintained; zero Electron dependency |
| **Playwright (`@playwright/test`)** | E2E integration across renderer + main process; Electron launch via `electron.launch()` | Only credible OSS E2E option for Electron with real multi-window support; built-in JSON, JUnit, HTML reporters; built-in screenshot comparison |
| **electron-playwright-helpers** | IPC helpers, dialog stubs, menu interaction, retry wrapper for Electron 27+ flakiness | Actively maintained (v2.1.0, Dec 2025); adds critical retry logic around `evaluate()` calls that otherwise produce non-deterministic failures |
| **`@xstate/test@beta`** | Model-based test path generation from XState machine definitions | The beta release supports XState v5 via `createTestModel()` — functional but watch for API changes when consolidated into `@xstate/graph` |
| **Playwright snapshot assertions** | Visual regression (pixel-level screenshot diffing) | Zero additional dependency; uses pixelmatch; deterministic; configurable diff thresholds |

**Explicitly excluded:** Cypress. See Section 2 for details.

---

## 2. Tool Evaluations

### 2.1 Playwright

**What it does:** Full browser/Electron automation framework. Drives a real Electron process, controls windows, reads the DOM, fires events, intercepts network calls, and takes screenshots.

**Electron compatibility:** Experimental by label, production-grade in practice. VS Code uses Playwright for its own E2E suite. The API is `electron.launch({ args: ['.'] })` returning an `ElectronApplication` instance. Supports `firstWindow()` to retrieve the initial renderer `Page`, and `evaluate()` to run code in the main process. Minimum supported Electron version is 12.2.0 / 13.4.0 / 14+.

**Known issues:** Electron 36.x caused `electron.launch()` errors (GitHub issue #47419 in electron/electron). The issue was resolved in Electron 37. Starting from Electron 27, `evaluate()` and similar calls became flaky due to context timing races — mitigated by `electron-playwright-helpers` v2.0+ retry logic.

**Maintenance status:** Actively maintained by Microsoft. Released multiple times per month. The de-facto standard for JavaScript E2E testing as of 2026.

**Reporters available (built-in):** `json`, `junit`, `html`, `dot`, `list`. Multiple reporters can run simultaneously.

**Verdict:** Include. Primary E2E layer.

---

### 2.2 Cypress

**What it does:** Browser-based E2E testing framework with a time-travel debugger and a test runner UI.

**Electron compatibility:** Cypress bundles its own version of Electron as the default test runner browser, but this is purely internal — it does not provide a mechanism to launch and control *your* Electron application as an SUT (System Under Test). Cypress has no equivalent to Playwright's `electron.launch()`.

**2026 update:** Cypress has an open issue (#33524) to *remove* Electron as its bundled browser and is actively planning to drop it. The Cypress Electron version lags behind the current Electron release track, causing Chromium API mismatches.

**Verdict:** Exclude. Cypress cannot drive a standalone Electron application. It is a browser-only testing tool. Do not use it for TacticalMelee.

---

### 2.3 Vitest

**What it does:** Vite-native test runner. Supports ESM, TypeScript, and JSX out of the box by sharing the Vite transform pipeline. Has `projects` (formerly `workspace`) configuration to run test suites in multiple environments (node, jsdom) in one `vitest run` invocation.

**Electron compatibility:** Vitest does not launch Electron — it runs in Node or jsdom. This is the correct scope for it. State machine actors, pure utility functions, and React components rendered into jsdom do not need a live Electron process.

**electron-vite integration:** electron-vite does not ship a Vitest preset. The `vitest.config.ts` is maintained separately from `electron.vite.config.ts`. This is the established pattern in the community. Two named projects should be defined: `unit` (environment: `node`, covers XState machines and pure logic in `src/main/`) and `renderer` (environment: `jsdom`, covers React components in `src/renderer/`).

**Reporters available:** `json`, `junit`, `html`, `verbose`, `dot`. JSON output is Jest-compatible.

**Maintenance status:** Actively maintained by the Vite core team. First-party choice for any Vite project in 2026.

**Verdict:** Include. Unit and component layers.

---

### 2.4 React Testing Library

**What it does:** Renders React components into a DOM (via jsdom when used with Vitest) and provides queries that reflect how users find elements (by role, label, text). Explicitly discourages testing implementation details.

**Electron compatibility:** None required — RTL operates at the component level in jsdom, independent of any electron process.

**Maintenance status:** Actively maintained under the Testing Library umbrella. Works with Vitest via `@testing-library/react` + `@testing-library/jest-dom` (the matchers are compatible with Vitest's `expect`).

**Verdict:** Include. Component test layer, used with Vitest.

---

### 2.5 electron-playwright-helpers

**What it does:** Augments Playwright's Electron API with:
- `parseElectronApp()` / `findLatestBuild()` — locate packaged builds
- IPC helpers — send and receive IPC messages in tests
- `stubDialog()` — prevent OS dialog windows from appearing during test runs
- `clickMenuItemById()` — interact with Electron menus
- `retry()` / `retryUntilTruthy()` — wrap any `evaluate()` call to auto-retry on "context closed" errors

**Maintenance status:** Actively maintained. Latest release v2.1.0 was published December 28, 2025. 37 releases total. Written in TypeScript. Requires Node 18+.

**Verdict:** Include as a Playwright companion. Required for reliable IPC testing and dialog suppression.

---

### 2.6 `@xstate/test@beta` / `@xstate/graph`

**What it does:** Given an XState machine definition, generates all reachable paths through the state graph (shortest paths or simple paths). Each path becomes a test plan: an ordered sequence of events with associated assertions to run at each state.

**XState v5 compatibility:** The stable `@xstate/test` package targets v4. The `@xstate/test@beta` package introduces the `createTestModel()` API (replacing `createModel()`) and has functional v5 support. The Stately team is consolidating `@xstate/test` and `@xstate/graph` into a single package — comments in the GitHub discussion (April 2026) indicate the graph/test utilities are moving into the main `xstate` package.

**Risk:** API is in flux. `@xstate/test@beta` should be pinned to a specific version. If the consolidation into `xstate` core completes before implementation, the import path will change. Monitor `statelyai/xstate` releases.

**Scope in TacticalMelee:** Applies to the four pure XState machines — critter, bout, skirmish, and geomancer actor. These machines are framework-agnostic; their tests run entirely in Vitest (Node environment), no Playwright needed.

**Verdict:** Include at beta with pinned version. Use for the four actor machines only. Wrap each generated test plan in a Vitest `describe` block.

---

### 2.7 Playwright Built-in Visual Regression (snapshot assertions)

**What it does:** `expect(page).toHaveScreenshot()` captures a PNG on first run (establishing a baseline) and performs pixel-level diffing on subsequent runs using the pixelmatch library. Differences are reported as a diff image. Configurable thresholds: `maxDiffPixels` (absolute count) and `maxDiffPixelRatio` (percentage).

**Electron compatibility:** Works against any Playwright `Page` — including Electron renderer windows. No additional setup needed.

**Maintenance status:** Part of the `@playwright/test` package — same maintenance guarantee as Playwright itself.

**Alternatives considered:** External services (Percy, Chromatic) are cloud-only paid tools. `pixelmatch` standalone would require custom screenshot orchestration. Playwright's built-in solution is fully sufficient for this project's scope.

**Verdict:** Include. Zero additional dependency beyond Playwright itself.

---

## 3. Test Architecture

The testing pyramid has five layers. Layers 1–3 run via `vitest run`. Layers 4–5 run via `playwright test`. All layers produce machine-readable output (JSON or JUnit XML).

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 5: Visual Regression                                 │
│  Playwright toHaveScreenshot() — Group HUD, GM Dashboard,  │
│  TMCritterMaker panels                                      │
├─────────────────────────────────────────────────────────────┤
│  Layer 4: E2E / Integration                                 │
│  Playwright + electron.launch() — full app flows,          │
│  multi-window, IPC, menus, dialog stubs                     │
├─────────────────────────────────────────────────────────────┤
│  Layer 3: Component Tests                                   │
│  Vitest + React Testing Library (jsdom) — BoutCard,        │
│  CombatantRow, CritterEditor, LibraryPanel, ...            │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: State Machine Model-Based Tests                   │
│  Vitest (node) + @xstate/test@beta — critter, bout,        │
│  skirmish, geomancer actor path coverage                   │
├─────────────────────────────────────────────────────────────┤
│  Layer 1: Unit Tests                                        │
│  Vitest (node) — pure functions, helpers, YAML parsing,    │
│  combat math, state transition guards                       │
└─────────────────────────────────────────────────────────────┘
```

### 3.1 Vitest project configuration

`vitest.config.ts` (at repo root, separate from `electron.vite.config.ts`):

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    reporters: ['default', ['json', { outputFile: 'test-results/vitest.json' }], 'junit'],
    outputFile: { junit: 'test-results/vitest-junit.xml' },
    projects: [
      {
        name: 'unit',
        test: {
          include: ['src/main/**/*.test.ts', 'src/shared/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        name: 'renderer',
        test: {
          include: ['src/renderer/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
          setupFiles: ['./test/setup-dom.ts'],
        },
      },
    ],
  },
})
```

`test/setup-dom.ts`:
```typescript
import '@testing-library/jest-dom'
```

### 3.2 Playwright configuration

`playwright.config.ts` (at repo root):

```typescript
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  reporter: [
    ['dot'],
    ['json', { outputFile: 'test-results/playwright.json' }],
    ['junit', { outputFile: 'test-results/playwright-junit.xml' }],
    ['html', { outputFolder: 'test-results/playwright-html', open: 'never' }],
  ],
  use: {
    // No browser — Electron tests use the electron fixture directly.
    // Browser-mode tests would go here if ever needed for isolated renderer work.
  },
  projects: [
    {
      name: 'electron-e2e',
      testMatch: 'e2e/**/*.spec.ts',
    },
    {
      name: 'visual',
      testMatch: 'e2e/**/*.visual.ts',
    },
  ],
})
```

### 3.3 Directory layout

```
TacticalMelee/
├── src/
│   ├── main/           # Electron main process — unit tests colocated as *.test.ts
│   ├── preload/
│   ├── renderer/       # React components — component tests colocated as *.test.tsx
│   └── shared/         # Pure logic, XState machines — unit + model-based tests
├── e2e/
│   ├── fixtures/
│   │   └── electron.ts       # Shared Playwright fixture: launches and tears down Electron
│   ├── group-hud.spec.ts
│   ├── gm-dashboard.spec.ts
│   ├── tmcrittermaker.spec.ts
│   ├── group-hud.visual.ts   # Visual regression tests
│   └── gm-dashboard.visual.ts
├── test/
│   └── setup-dom.ts
├── test-results/             # All machine-readable output written here
│   ├── vitest.json
│   ├── vitest-junit.xml
│   ├── playwright.json
│   └── playwright-junit.xml
├── vitest.config.ts
└── playwright.config.ts
```

### 3.4 Electron test fixture

`e2e/fixtures/electron.ts`:

```typescript
import { test as base, expect } from '@playwright/test'
import { ElectronApplication, Page, _electron as electron } from 'playwright'
import { findLatestBuild, parseElectronApp } from 'electron-playwright-helpers'
import path from 'path'

type ElectronFixtures = {
  electronApp: ElectronApplication
  mainWindow: Page
}

export const test = base.extend<ElectronFixtures>({
  electronApp: async ({}, use) => {
    // For dev: launch via electron-vite's built output.
    // For CI: use findLatestBuild() to locate a packaged app.
    const appPath = path.join(__dirname, '../out/main/index.js')
    const app = await electron.launch({
      args: [appPath],
      env: { ...process.env, NODE_ENV: 'test' },
    })
    await use(app)
    await app.close()
  },
  mainWindow: async ({ electronApp }, use) => {
    const win = await electronApp.firstWindow()
    await win.waitForLoadState('domcontentloaded')
    await use(win)
  },
})

export { expect }
```

### 3.5 Model-based test pattern for XState actors

`src/shared/machines/__tests__/bout.model.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { createTestModel } from '@xstate/test'
import { boutMachine } from '../boutMachine'

const model = createTestModel(boutMachine)

describe('Bout machine model-based tests', () => {
  const plans = model.getShortestPlans()

  for (const plan of plans) {
    describe(plan.description, () => {
      for (const path of plan.paths) {
        it(path.description, async () => {
          await path.test({
            // Assertion callbacks keyed by state name
            idle: async () => {
              expect(/* actor snapshot check */).toBeDefined()
            },
            measuring: async () => {
              // assert measuring state invariants
            },
          })
        })
      }
    })
  }
})
```

---

## 4. Test Plan Generator Skill Design

### 4.1 Purpose

This skill reads a natural-language feature description or user story and produces a structured, executable test specification. The specification is written to a file and can optionally scaffold the test code stubs.

### 4.2 Trigger

Invoked when a developer says something like:
- "Generate tests for the BoutCard component"
- "Write a test spec for the declare-action flow in the GM Dashboard"
- "Create model-based test cases for the skirmish machine"

The skill is **not** the test runner. It only produces the specification / stubs.

### 4.3 Inputs

| Input | Source | Description |
|-------|--------|-------------|
| Feature description | User prompt or referenced file | Natural language or a section of `docs/feature-and-ui-spec.md` |
| Target layer | Derived or explicit | unit / component / e2e / visual / model-based |
| Target file(s) | Explicit or inferred | Path to the component, machine, or spec file being targeted |
| Acceptance criteria | Optional | Bullet list of must-pass behaviours |

### 4.4 Outputs

The skill writes two files:

1. **`test-specs/<feature-slug>.spec.yaml`** — a structured, human-readable test specification
2. **`<colocated-test-file>.test.ts(x)` or `e2e/<feature>.spec.ts`** — scaffolded code stubs with `it.todo()` markers and inline comments from the spec

#### Spec YAML format

```yaml
# test-specs/bout-card-component.spec.yaml
feature: BoutCard Component
layer: component
target: src/renderer/components/BoutCard.tsx
generated: 2026-05-07
acceptance_criteria:
  - Renders combatant names from props
  - Shows "Measuring" label when bout state is `measuring`
  - Shows wager outcome when bout state is `resolved`
  - Fires onDeclare callback when declare button is clicked

test_cases:
  - id: TC-001
    title: Renders combatant names
    preconditions:
      - BoutCard receives { red: "Gregor", blue: "Aldric", state: "idle" }
    steps:
      - Render <BoutCard> with the above props
      - Query by text "Gregor"
      - Query by text "Aldric"
    expected:
      - Both names are present in the rendered output

  - id: TC-002
    title: Shows measuring label in measuring state
    preconditions:
      - bout state is "measuring"
    steps:
      - Render <BoutCard state="measuring">
      - Query by text "Measuring"
    expected:
      - "Measuring" label is visible

  - id: TC-003
    title: Fires onDeclare when declare button clicked
    preconditions:
      - bout state is "idle"
      - onDeclare prop is a spy function
    steps:
      - Click the "Declare" button
    expected:
      - onDeclare has been called once
```

#### Scaffolded code stub (component layer example)

```typescript
// src/renderer/components/__tests__/BoutCard.test.tsx
// AUTO-GENERATED STUBS — fill in assertions; remove .todo when done
// Spec: test-specs/bout-card-component.spec.yaml

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BoutCard } from '../BoutCard'

describe('BoutCard Component', () => {
  // TC-001: Renders combatant names
  it.todo('renders combatant names from props', async () => {
    // render(<BoutCard red="Gregor" blue="Aldric" state="idle" />)
    // expect(screen.getByText('Gregor')).toBeInTheDocument()
    // expect(screen.getByText('Aldric')).toBeInTheDocument()
  })

  // TC-002: Shows measuring label in measuring state
  it.todo('shows "Measuring" label when state is measuring', async () => {
    // render(<BoutCard state="measuring" />)
    // expect(screen.getByText('Measuring')).toBeVisible()
  })

  // TC-003: Fires onDeclare when declare button clicked
  it.todo('fires onDeclare callback on button click', async () => {
    // const onDeclare = vi.fn()
    // render(<BoutCard state="idle" onDeclare={onDeclare} />)
    // await userEvent.click(screen.getByRole('button', { name: /declare/i }))
    // expect(onDeclare).toHaveBeenCalledOnce()
  })
})
```

### 4.5 Skill operation sequence

```
1. Read the feature description (prompt or referenced doc section)
2. Read the target file(s) with the Read tool to understand current props/state shape
3. If XState machine: read the machine definition to enumerate states and events
4. Draft test_cases in the YAML spec format above
5. Write test-specs/<slug>.spec.yaml
6. Write the colocated stub file (it.todo stubs, not implemented)
7. Report: list of TC IDs written, target file path, layer
```

The skill does **not** run tests. It does **not** implement assertions. It produces scaffolding for a developer to complete.

---

## 5. Test Runner Skill Design

### 5.1 Purpose

This skill runs the existing test suite (or a named subset), reads the structured JSON/JUnit output, identifies failures and regressions, and produces a concise human-readable summary. It is deterministic and non-interactive.

### 5.2 Trigger

Invoked when a developer says something like:
- "Run the full test suite"
- "Run unit tests and tell me what broke"
- "Run the E2E tests against the Group HUD"
- "Check for regressions after this change"

### 5.3 Shell commands

The skill executes these commands sequentially via the Bash tool:

```bash
# Step 1: Unit + component tests
npx vitest run --reporter=json --outputFile=test-results/vitest.json 2>&1

# Step 2: E2E + visual tests
npx playwright test --reporter=json 2>&1
# (JSON output goes to test-results/playwright.json per playwright.config.ts)

# Optional: targeted subsets
npx vitest run --project=unit 2>&1
npx vitest run --project=renderer 2>&1
npx playwright test e2e/group-hud.spec.ts 2>&1
npx playwright test --grep "visual" 2>&1
```

All output files are written to `test-results/`.

### 5.4 Reading and interpreting output

**Vitest JSON schema (key fields):**

```
testResults[].testFilePath        — file under test
testResults[].testResults[].title — test name
testResults[].testResults[].status — "passed" | "failed" | "todo" | "skipped"
testResults[].testResults[].failureMessages[] — error text
numPassedTests, numFailedTests, numTodoTests
```

**Playwright JSON schema (key fields):**

```
suites[].specs[].tests[].results[].status — "passed" | "failed" | "timedOut" | "skipped"
suites[].specs[].title                    — test name
suites[].specs[].tests[].results[].error.message — failure detail
stats.unexpected                          — count of unexpected failures
```

The skill reads both files with the Read tool after commands complete.

### 5.5 Regression report format

The skill outputs a structured report directly in chat (not written to a file). Format:

```
TEST RUN SUMMARY  2026-05-07 14:32
────────────────────────────────────────────────────────────
VITEST (unit + renderer)
  Passed : 47
  Failed :  2
  Todo   :  8
  Skipped:  1

PLAYWRIGHT (e2e + visual)
  Passed : 12
  Failed :  1
  Timed  :  0

FAILURES
────────────────────────────────────────────────────────────
[VITEST] src/shared/machines/__tests__/bout.model.test.ts
  TC: "resolves to red-wins when red lands clean strike"
  Error: Expected state to be "resolved", received "measuring"
  Hint: State guard or transition condition likely regressed.

[VITEST] src/renderer/components/__tests__/BoutCard.test.tsx
  TC: "shows measuring label when state is measuring"
  Error: Unable to find element with text: /Measuring/
  Hint: DOM output may have changed — check BoutCard render path.

[PLAYWRIGHT] e2e/group-hud.spec.ts
  TC: "displays all combatants after bout starts"
  Error: Timeout waiting for selector [data-testid="combatant-row"]
  Hint: Possible IPC timing issue or selector mismatch.

REGRESSION ASSESSMENT
────────────────────────────────────────────────────────────
New failures vs previous run: 2 (Vitest), 1 (Playwright)
Previously failing, now passing: 0
No visual regression diffs detected.

RECOMMENDATION
  Fix bout machine guard before merging. BoutCard label failure
  appears related — check if bout state name was renamed.
```

### 5.6 Skill operation sequence

```
1. Determine scope (full suite, unit-only, e2e-only, or named spec file) from prompt
2. Run vitest command via Bash tool; capture exit code and stdout
3. Run playwright command via Bash tool; capture exit code and stdout
4. Read test-results/vitest.json with Read tool
5. Read test-results/playwright.json with Read tool
6. Parse failures: extract test name, file, error message for each failed test
7. If visual tests ran: check playwright.json for snapshot comparison failures;
   note diff image paths in test-results/playwright-html/
8. Compare to previous run if a prior vitest.json/playwright.json exists
   (rename previous to *.prev.json before step 2)
9. Output regression report in the format above
```

---

## 6. Phased Rollout

### Phase 1 — Current surfaces (immediate)

**Scope:** Group HUD, GM Dashboard, TMCritterMaker. All four XState machines.

**Deliverables:**

| Priority | Item | Layer | Tool |
|----------|------|-------|------|
| P1 | XState machine unit tests — all four machines | Unit | Vitest (node) |
| P1 | Model-based path coverage — critter and bout machines | Model | `@xstate/test@beta` + Vitest |
| P1 | YAML parsing + combat math utility tests | Unit | Vitest (node) |
| P2 | BoutCard, CombatantRow, OutcomeDisplay component tests | Component | Vitest + RTL |
| P2 | GMDashboard control panel component tests | Component | Vitest + RTL |
| P2 | TMCritterMaker YAML editor panel component tests | Component | Vitest + RTL |
| P3 | E2E: Group HUD — bout start, combatant display, outcome render | E2E | Playwright |
| P3 | E2E: GMDashboard — add combatant, advance turn, trigger event | E2E | Playwright |
| P3 | E2E: TMCritterMaker — load YAML, edit, run harness | E2E | Playwright |
| P4 | Visual baselines: Group HUD idle state, GMDashboard idle state | Visual | Playwright snapshots |

**Acceptance criteria for Phase 1:**
- `npx vitest run` exits 0 with JSON output in `test-results/`
- `npx playwright test` exits 0 with JSON and HTML output in `test-results/`
- Claude Code test runner skill can consume both output files and produce a summary
- All four XState machines have at least one model-based test plan with full state coverage

---

### Phase 2 — Planned surfaces (extend without rework)

**Scope:** Player dashboards (one per player), Master Battle Map HUD.

**Extension architecture:**

These surfaces arrive as new Electron windows or new renderer routes. The test infrastructure does **not** need to change. The extension pattern is:

1. **New E2E spec file** per new surface, following the same fixture pattern (`e2e/player-dashboard.spec.ts`, `e2e/battle-map-hud.spec.ts`).
2. **Multi-window helper** — `electron-playwright-helpers` supports `waitForWindow()` to retrieve a second window by URL or title. Player dashboard windows are accessed this way:
   ```typescript
   const playerWin = await electronApp.waitForEvent('window', {
     predicate: (w) => w.url().includes('player-dashboard'),
   })
   ```
3. **Component tests** for new React components colocate with the component file — no Vitest config change required.
4. **Visual baselines** are added by simply running the visual test suite once against the new surface; Playwright auto-creates the baseline screenshot.
5. **Test plan generator skill** operates identically — point it at the new feature spec.

**No infrastructure rework is required.** The `vitest.config.ts` `projects` array does not change. The `playwright.config.ts` test directories pick up new spec files automatically via glob.

---

### Phase 3 — Full regression suite with CI integration

**Scope:** All surfaces, all layers, automated on every push.

**CI pipeline (GitHub Actions sketch):**

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run build  # electron-vite build — produces out/
      - run: npx vitest run --reporter=json --outputFile=test-results/vitest.json
      - run: npx playwright install --with-deps chromium  # only chromium needed for Electron
      - run: npx playwright test
        env:
          CI: true  # enables Playwright retries (retries: 2)
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: test-results
          path: test-results/
```

**Visual regression in CI:** Baseline screenshots must be committed to the repository under `e2e/__snapshots__/`. The CI run compares against committed baselines. Diffs are uploaded as artifacts. A developer reviews and updates baselines by running `npx playwright test --update-snapshots` locally and committing the new baseline PNGs.

**Shard strategy (if suite grows slow):** Playwright supports `--shard=1/3`, `--shard=2/3`, `--shard=3/3` to split E2E across parallel CI runners. Vitest supports `--shard` similarly. Both write JUnit output that can be merged by the CI system (GitHub Actions test summary, or a JUnit merge step).

**Claude Code test runner skill in CI context:** The skill can be triggered as a post-test step by reading the uploaded artifact JSON files, or run locally after pulling results. It requires only the JSON files — it does not need to re-run the tests.

---

## 7. Open Questions

These questions must be resolved before implementation begins. They are blockers or significant design decisions.

| # | Question | Blocking | Notes |
|---|----------|---------|-------|
| OQ-1 | What version of Electron is TacticalMelee currently targeting? | E2E setup | Electron 36.x has a known `electron.launch()` bug. If targeting 36, either pin to 35 temporarily or wait for 37. |
| OQ-2 | Is `@xstate/test@beta` pinned or does the project use a version range? | Model-based tests | The beta API is in flux; it must be pinned. Also need to decide whether to wait for the `xstate` core consolidation. |
| OQ-3 | Does the app have a `--no-sandbox` or CDP flag available for test launches? | E2E setup | Playwright uses the Chrome DevTools Protocol (CDP) to attach to Electron. Some hardened Electron configs disable this. |
| OQ-4 | Are there multiple renderer windows at launch, or one primary window? | E2E fixture | The E2E fixture uses `firstWindow()`. If Group HUD and GMDashboard are separate windows, the fixture needs to handle multiple windows from the start. |
| OQ-5 | Is there a `NODE_ENV=test` code path in the main process, or will IPC stubs be needed? | E2E reliability | Test-specific code paths (disabling splash screens, skipping auth) simplify E2E considerably. |
| OQ-6 | Where do visual baseline PNGs live in the repo? | Visual regression | Recommend `e2e/__snapshots__/` committed to git. Confirm this is acceptable given PNG binary size in the repo. |
| OQ-7 | Is there a build step required before E2E tests can run (i.e., does Playwright need the built `out/` directory)? | CI setup | If electron-vite needs a full build, CI time increases. A dev-mode launch via `electron .` is faster but may differ from production. |
| OQ-8 | Should the test plan generator write stubs as `it.todo()` or as failing `it()` with placeholder assertions? | Skill design | `it.todo()` is clean but invisible in coverage. Placeholder `it()` with `expect.fail()` would show in CI as a failure until implemented. Either is valid — choose a convention. |

---

## 8. Assumptions

| # | Assumption | Impact if Wrong |
|---|-----------|----------------|
| A-1 | Node.js version is 20 LTS (required by `electron-playwright-helpers` v2.0+ which needs Node 18+). | If Node 16 is in use, upgrade is required before proceeding. |
| A-2 | The package manager is `npm`. All commands use `npx`. | Replace `npx` with `pnpm exec` or `yarn` if needed; no other change required. |
| A-3 | The repo has a `build` script in `package.json` that runs `electron-vite build` and outputs to `out/`. | E2E launch path `out/main/index.js` will be wrong if output directory differs. |
| A-4 | XState machines are defined as importable TypeScript modules in `src/shared/machines/` with no runtime Electron dependencies. | If machines import Electron APIs (e.g., `ipcRenderer`) they cannot run in the Vitest node environment. Machines should be pure; IPC should be injected via actor input or context. |
| A-5 | CI will run on Linux (ubuntu-latest). | Playwright screenshot baselines are OS-dependent. Baselines committed from a Windows machine will not match Linux CI output. Baselines must be generated on the CI OS or the visual test suite must be run only locally. |
| A-6 | The project has internet access in CI for `playwright install` to download browser binaries. | If not, Playwright browser binaries must be cached or bundled. |
| A-7 | There is no existing test setup (no `__tests__` directories, no `*.test.ts` files, no `vitest.config.ts`). | If there is an existing setup, the configuration above may conflict; audit before writing new config files. |
| A-8 | TMCritterMaker is a separate Electron project in a separate directory (not a workspace package of TacticalMelee). | If it is part of a monorepo workspace, Vitest's `projects` and Playwright's `testDir` need separate entries for each package. |

---

## Appendix A: Package installation reference

```bash
# Vitest + React Testing Library (dev dependencies)
npm install -D vitest @vitejs/plugin-react jsdom \
  @testing-library/react @testing-library/jest-dom @testing-library/user-event

# Playwright (dev dependency)
npm install -D @playwright/test
npx playwright install  # downloads browser binaries

# electron-playwright-helpers
npm install -D electron-playwright-helpers

# @xstate/test beta (pin to a specific version after checking latest beta tag)
npm install -D @xstate/test@beta
```

---

## Appendix B: Key references

- Playwright Electron API: https://playwright.dev/docs/api/class-electron
- Playwright visual comparisons: https://playwright.dev/docs/test-snapshots
- Playwright reporters: https://playwright.dev/docs/test-reporters
- electron-playwright-helpers: https://github.com/spaceagetv/electron-playwright-helpers
- Vitest projects configuration: https://vitest.dev/guide/projects
- Vitest reporters: https://vitest.dev/guide/reporters
- @xstate/test v5 discussion: https://github.com/statelyai/xstate/discussions/4761
- @xstate/graph v5 discussion: https://github.com/statelyai/xstate/discussions/4653
- Cypress removing Electron support: https://github.com/cypress-io/cypress/issues/33524
- Electron 36.x Playwright launch bug: https://github.com/electron/electron/issues/47419
