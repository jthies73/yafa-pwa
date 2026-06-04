# Yafa Project

> **Instructions sync**: This project maintains two parallel instruction files — `CLAUDE.md` (Claude Code) and `.gemini/instructions.md` (Gemini). Whenever instructions are added or changed in one file, apply the same change to the other.

## Design Language & Visual Aesthetics

- **Minimalistic, flat, technical style**: Maintain a polished, minimalistic, flat, and clean aesthetic. Avoid unnecessary gradients, heavy skeuomorphism, or decorative bloat.
- **Primary accent color**: `#1fc7b9` (turquoise). Support dark/light mode using Tailwind v4 theme variables.
- **Mobile-first approach**: Design all layouts, interactions, and media screens primarily for mobile viewports, ensuring a seamless phone interface before scaling to larger screens.
- **Consistency**: Align new components with existing styles, typography, and spacing.
- **Assets**: Never use generic image placeholders. Prefer inline SVGs or programmatic graphics styled with Tailwind utility classes.
- **Interactive Cursor**: Explicitly apply the `cursor-pointer` utility class (or `cursor: pointer` in CSS) to all clickable elements (buttons, links, triggers, interactive controls) to ensure clear visual feedback.
- **Interactive Feedback**: Clickable elements must change color slightly on hover to indicate clickability (in addition to having `cursor-pointer`). There should be no animation (such as scale or translate transitions) on hover.
- **Navigation Highlighting**: Navigation links in headers or menus must remain highlighted (using the active/accent style) when navigating into subroutes or details pages corresponding to that section (e.g., keeping "Plans" highlighted when on `/plans/:id`).

## Stack & Technologies

- **Framework**: Vue 3 with Composition API (`<script setup lang="ts">`)
- **Build system**: Vite
- **Styling**: Tailwind CSS v4 — always prefer utility classes over custom CSS
- **Component library**: Reka UI — use it for complex UI controls and accessible structures instead of building from scratch
- **PWA**: `vite-plugin-pwa`
- **State persistence**: Dexie.js (IndexedDB) for offline persistence of workouts, exercises, routines, and RPE grids

## Project Structure

- `index.html` — static landing page with inline styles, logo, and 3-second redirect logic (kept static for SEO before JS execution)
- Vue app mounts to `#app` and resolves directly to `Dashboard.vue`
- `src/components/Dashboard.vue` — main dashboard component

## Code Guidelines

- Reuse existing components whenever possible; avoid duplicate logic or styling
- Keep components focused, reusable, and single-purpose
- Use strict TypeScript: interface definitions, `ref`, `computed`, and proper typing throughout
- Format code with Prettier before finalizing: `yarn format`
