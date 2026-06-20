# CLAUDE.md

Guidance for Claude Code when working in this repository.

> **Instructions sync**: `CLAUDE.md` (Claude Code) and `.gemini/instructions.md` (Gemini) are parallel files. Apply any instruction change to both.

> **Read [README.md](./README.md)** for the design rationale, workout engine concepts (e1RM, RPE matrix, progression models, resets, mesocycles), and feature overview. Don't duplicate that here.

## Architecture

- **`src/engine/`** — Core workout logic. Pure, no Vue deps, independently testable (`service`, `prescription`, `calculator`, `matrix`, `adjustment`).
- **`src/db/`** — Dexie/IndexedDB data layer. Schema (`db.ts`), interfaces (`types.ts`), CRUD (`repository.ts`), seed/backup helpers.
- **`src/composables/`** — Vue 3 logic: refs, computed, watchers, side effects, gestures, unit fields.
- **`src/components/`** — Vue SFCs. `Dashboard.vue` is the main shell. Modals and forms build on `AppBottomSheet.vue` (drag-to-dismiss, optional drag-to-dock, `useBottomSheetGestures`) — reuse it instead of rolling a new dialog. `WorkoutBottomSheet.vue` is the minimizable running-workout variant. A destructive "Delete" action in a bottom sheet belongs in the sheet header (the `#title` slot, right-aligned) — never in a footer — and confirms via `ConfirmDialog.vue`.
- **`src/router/`** — Client-side routing.
- **`src/analytics/`** — Workout history aggregation and Chart.js rendering.

`index.html` is a static landing page (inline styles + ~3s redirect) kept static for SEO before JS runs — don't convert it into a Vue route. The app mounts at `#app`.

Persistence: all data is offline via IndexedDB. Save/restore the route `fullPath` (e.g. `/plans/123`) so reloads return to the exact page. PWA uses "prompt" mode.

## Stack

- Vue 3 Composition API (`<script setup lang="ts">`), Vite, strict TypeScript
- Tailwind CSS v4 — prefer utility classes, no custom CSS
- Reka UI for complex/accessible controls
- Dexie.js (IndexedDB), `vite-plugin-pwa`

## Code Guidelines

- Reuse existing components; keep them focused and single-purpose.
- Engine functions stay pure; all DB access goes through `repository.ts`; types live in `types.ts`.
- Composables for Vue-specific logic only; plain functions for domain logic.
- New feature flow follows the dependency direction: types (`types.ts`) → CRUD (`repository.ts`) → composable → component → route.
- No barrel exports unless grouping related types.
- Colocate tests under `__tests__/`.
- Comment only when the **why** is non-obvious. No multi-paragraph docstrings. Use template section comments (`<!-- ... -->`) for navigation.
- Run `yarn format` before finalizing.

## Design Language

- Minimalistic, flat, technical. No gradients/skeuomorphism. Accent color `#1fc7b9` (turquoise); support dark/light via Tailwind v4 theme vars.
- Mobile-first. Use only three breakpoints: default, `md:`, `lg:` — never `sm:`, `xl:`, `2xl:`.
- Apply `cursor-pointer` to all clickable elements; they must shift color on hover (no scale/translate animations).
- Keep nav links highlighted on their subroutes (e.g. "Plans" while on `/plans/:id`).
- Never use placeholder images — prefer inline SVG / programmatic graphics.
- Segmented selectors (tabs / multi-option pickers in a sheet or form) reuse the `ExerciseConfigSheet.vue` progression-model pattern: a `flex gap-1 p-1 … rounded-xl` container of `flex-1 rounded-lg` buttons, active = `bg-accent text-bg-dark`.
- Binary unit/setting toggles reuse the `SettingsPage.vue` pattern: one `role="switch"` button wrapping two equal `flex-1` spans, active span = `bg-accent text-bg-dark font-bold`.

## Commands

```bash
yarn test:unit                 # all tests
yarn test:unit:watch           # watch mode
yarn test:unit -- <file>       # specific file
yarn type-check                # Vue templates + TS
yarn format && yarn lint
```

Run `yarn test:unit` before committing.
