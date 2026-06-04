<script setup lang="ts">
import { ref } from "vue";

interface Category {
  name: string;
  count: number;
  iconPath: string; // SVG path
}

const categories = ref<Category[]>([
  {
    name: "Chest",
    count: 12,
    iconPath: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  },
  {
    name: "Back",
    count: 14,
    iconPath: "M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
  },
  {
    name: "Legs",
    count: 18,
    iconPath:
      "M4 3h16a2 2 0 0 1 2 2v6a10 10 0 0 1-10 10A10 10 0 0 1 2 11V5a2 2 0 0 1 2-2z",
  },
  {
    name: "Shoulders",
    count: 10,
    iconPath:
      "M12 2a5 5 0 0 0-5 5v3a5 5 0 0 0 10 0V7a5 5 0 0 0-5-5zM12 14c-4.42 0-8 1.79-8 4v2h16v-2c0-2.21-3.58-4-8-4z",
  },
  {
    name: "Arms",
    count: 15,
    iconPath:
      "M6.5 2C3.46 2 1 4.46 1 7.5c0 1.63.7 3.09 1.83 4.1C1.72 12.82 1 14.57 1 16.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5c0-1.93-.72-3.68-1.83-4.9C11.3 10.59 12 9.13 12 7.5 12 4.46 9.54 2 6.5 2z",
  },
  {
    name: "Core",
    count: 8,
    iconPath:
      "M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z",
  },
]);

const handleCategoryClick = (categoryName: string) => {
  console.log(`Exercise Category clicked: ${categoryName}`);
};
</script>

<template>
  <div class="p-6 relative min-h-full flex flex-col animate-fade-in">
    <!-- Header Section -->
    <div
      class="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
    >
      <div>
        <h1
          class="text-3xl font-bold tracking-tight text-text-h-light dark:text-text-h-dark"
        >
          Exercises
        </h1>
        <p class="text-sm text-text-light dark:text-text-dark opacity-70 mt-1">
          Explore and manage your exercise database
        </p>
      </div>
    </div>

    <!-- Search Placeholder -->
    <div class="mb-8 max-w-md w-full relative">
      <div
        class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="text-text-light dark:text-text-dark opacity-55"
        >
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
      </div>
      <input
        type="text"
        placeholder="Search exercises..."
        disabled
        class="w-full bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-lg py-2.5 pl-10 pr-4 text-sm text-text-h-light dark:text-text-h-dark placeholder-text-light/50 dark:placeholder-text-dark/50 opacity-80 cursor-not-allowed focus:outline-none"
      />
    </div>

    <!-- Categories Grid -->
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
      <div
        v-for="category in categories"
        :key="category.name"
        class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl p-5 flex flex-col items-center justify-center text-center cursor-pointer transition-colors duration-150 hover:bg-surface-light-hover dark:hover:bg-surface-dark-hover"
        @click="handleCategoryClick(category.name)"
      >
        <div
          class="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center text-accent mb-3"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path :d="category.iconPath" />
          </svg>
        </div>
        <h3
          class="font-bold text-text-h-light dark:text-text-h-dark text-sm sm:text-base"
        >
          {{ category.name }}
        </h3>
        <span
          class="text-xs text-text-light dark:text-text-dark opacity-60 mt-1"
        >
          {{ category.count }} exercises
        </span>
      </div>
    </div>
  </div>
</template>
