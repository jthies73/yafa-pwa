# Yafa Project Gemini Instructions

This file contains base instructions and technical guidelines for Google Gemini to pair-program on the Yafa project.

> **Instructions sync**: This project maintains two parallel instruction files — `CLAUDE.md` (Claude Code) and `.gemini/instructions.md` (Gemini). Whenever instructions are added or changed in one file, apply the same change to the other.

---

## 🎨 Design Language & Visual Aesthetics
* **Minimalistic, Flat, & Technical Style**: Always maintain a highly polished, minimalistic, flat, and technical/clean aesthetic across the entire application. Avoid unnecessary gradients, heavy skeuomorphism, or bloated decorations. 
* **Harmonious Palette**: Use `#1fc7b9` (turquoise) as the primary accent color. Support dark/light mode configurations smoothly using Tailwind v4 theme variables.
* **Mobile-First Design**: Design all layouts, user experiences, and screen components primarily optimized for mobile viewports, ensuring a seamless phone interface before scaling upwards.
* **Alignment & Consistency**: When creating new components or populating pages, align the new designs seamlessly with existing stylings, typography, and spacing.
* **Asset Integrity**: Never use generic image placeholders. Prefer inline SVGs or clean programmatic graphics styled with Tailwind utility classes.
* **Interactive Cursor**: Explicitly apply the `cursor-pointer` utility class (or `cursor: pointer` in CSS) to all clickable elements (buttons, links, triggers, interactive controls) to ensure clear visual feedback.
* **Interactive Feedback**: Clickable elements must change color slightly on hover to indicate clickability (in addition to having `cursor-pointer`). There should be no animation (such as scale or translate transitions) on hover.
* **Navigation Highlighting**: Navigation links in headers or menus must remain highlighted (using the active/accent style) when navigating into subroutes or details pages corresponding to that section (e.g., keeping "Plans" highlighted when on `/plans/:id`).

---

## 🛠️ Stack & Technologies
* **Framework**: Vue 3 (Composition API using `<script setup lang="ts">`).
* **Build System**: Vite.
* **Styling**: Tailwind CSS v4. Always prefer Tailwind utility classes over custom CSS.
* **Component Library**: Use **Reka UI** components (installed in the project) when applicable instead of writing complex UI controls or accessible structures from scratch.
* **PWA**: Integrated using `vite-plugin-pwa`.
* **State Persistence / Database**: **Dexie.js** (IndexedDB wrapper) for robust, offline persistence of all app-related state (workouts, exercises, routines, RPE grids).

---

## 📂 Structural Layout & SEO
* **Static Landing Page**: The landing page is contained entirely in `index.html` (including styling, logo, and 3-second redirect logic) to optimize search engine crawling and SEO before JavaScript execution.
* **Vue App Entry**: Mounts to `#app` inside `index.html` and resolves to `Dashboard.vue` directly.
* **Dashboard Component**: Positioned inside `src/components/Dashboard.vue` containing only a beautiful, centered gradient headline.

---

## 🚀 Component Creation & Reuse Rules
* **Component Reuse**: Reuse existing components whenever possible to avoid duplicate logic or styling.
* **Code Splitting**: Keep components focused, reusable, and single-purpose.
* **TypeScript Best Practices**: Always use strict typing, interface definitions, and reactive primitives (`ref`, `computed`).
* **Code Formatting**: Ensure all code is cleanly formatted using Prettier (`yarn format`) before finalizing changes.
