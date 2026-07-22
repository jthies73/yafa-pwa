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

Persistence: all data is offline via IndexedDB. The app always starts on the dashboard. An in-progress workout is snapshotted to localStorage (`yafa:activeWorkout`, device-only, not in backups) and resumed on reopen — see `composables/workoutPersistence.ts`. PWA uses "prompt" mode.

**Data Schema Changes & Migrations**: Whenever you add, remove, or modify fields in the data layer (`src/db/types.ts`, `src/db/repository.ts`) that affect stored records, implement a **database migration** via Dexie's schema versioning in `src/db/db.ts`. Migrations run once on app boot and ensure all clients apply schema changes consistently. Do not rely on read-time backfill (like `normalizeProgressionParams`) as the primary mechanism for schema evolution — backfill is a convenience for truly optional new fields with safe defaults, but required/structural changes must be migrated. Document each migration with a comment explaining the change and its reason.

**Keeping `docs/` current**: `docs/` (data model, planning, execution, evaluation) anchors its claims to code — function names, file paths, and line numbers pinned to a `source-commit` in each doc's frontmatter (see `docs/index.md`). Whenever a change alters something a doc describes (engine logic, data model/schema, prescription/progression rules, mesocycle behavior, analytics), update the affected doc(s) in the same change: fix the described behavior, refresh line-number references, and bump `source-commit`/`updated` in the frontmatter. Don't leave docs describing stale behavior for a future pass.

**Updating `releases.json`**: Always update `public/releases.json` with a short description of what changed for any release or update (applies to major, minor, and patch changes).

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
