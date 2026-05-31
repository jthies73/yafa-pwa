# Yafa Project

> **Instructions sync**: This project maintains two parallel instruction files — `CLAUDE.md` (Claude Code) and `.gemini/instructions.md` (Gemini). Whenever instructions are added or changed in one file, apply the same change to the other.

## Design Language & Visual Aesthetics

- **Minimalistic, flat, technical style**: Maintain a polished, minimalistic, flat, and clean aesthetic. Avoid unnecessary gradients, heavy skeuomorphism, or decorative bloat.
- **Primary accent color**: `#1fc7b9` (turquoise). Support dark/light mode using Tailwind v4 theme variables.
- **Consistency**: Align new components with existing styles, typography, and spacing.
- **Assets**: Never use generic image placeholders. Prefer inline SVGs or programmatic graphics styled with Tailwind utility classes.

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
