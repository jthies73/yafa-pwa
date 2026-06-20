<script setup lang="ts">
// A small "i" affordance placed next to an ambiguous label. Tapping it opens a
// bottom sheet (reusing AppBottomSheet) with a plain-language explanation pulled
// from the shared INFO_TOPICS registry — so every term in the app is one tap from
// a definition without cluttering the layout.
import { computed, ref } from "vue";
import AppBottomSheet from "./AppBottomSheet.vue";
import { INFO_TOPICS } from "./info/infoTopics";

const props = defineProps<{ topic: string }>();

const open = ref(false);
const info = computed(() => INFO_TOPICS[props.topic]);

// The topic bodies encode structure with blank lines (paragraphs) and `•` lines
// (bullet lists). Parse that into blocks so we can render real spacing and lists
// instead of one preformatted blob. Bullets shaped "Term — explanation" get the
// term emphasised, giving the lists a definition-list feel.
type Block =
  | { type: "para"; text: string }
  | { type: "list"; items: { term: string | null; text: string }[] };

const blocks = computed<Block[]>(() => {
  if (!info.value) return [];
  return info.value.body
    .split(/\n\s*\n/)
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((block): Block => {
      const lines = block.split("\n").map((l) => l.trim());
      if (lines.length && lines.every((l) => l.startsWith("•"))) {
        return {
          type: "list",
          items: lines.map((l) => {
            const text = l.replace(/^•\s*/, "");
            const [term, ...rest] = text.split(" — ");
            return rest.length
              ? { term, text: rest.join(" — ") }
              : { term: null, text };
          }),
        };
      }
      return { type: "para", text: block };
    });
});
</script>

<template>
  <!-- Render nothing if the topic key is unknown rather than a broken icon. -->
  <button
    v-if="info"
    type="button"
    class="inline-flex shrink-0 items-center justify-center text-text-light dark:text-text-dark opacity-40 hover:opacity-100 hover:text-accent cursor-pointer transition-colors duration-150"
    :aria-label="`About ${info.title}`"
    @click.stop.prevent="open = true"
  >
    <svg
      class="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" stroke-linecap="round" />
      <path d="M12 8h.01" stroke-linecap="round" />
    </svg>
  </button>

  <AppBottomSheet v-if="info" v-model:open="open" :title="info.title">
    <div
      class="flex flex-col gap-4 px-5 pb-8 pt-5 text-[15px] leading-relaxed text-text-light dark:text-text-dark"
    >
      <template v-for="(block, i) in blocks" :key="i">
        <ul v-if="block.type === 'list'" class="flex flex-col gap-3">
          <li
            v-for="(item, j) in block.items"
            :key="j"
            class="flex items-start gap-3"
          >
            <span
              class="mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
            />
            <span>
              <span
                v-if="item.term"
                class="font-semibold text-text-h-light dark:text-text-h-dark"
                >{{ item.term }} — </span
              >{{ item.text }}
            </span>
          </li>
        </ul>
        <p v-else>{{ block.text }}</p>
      </template>
    </div>
  </AppBottomSheet>
</template>
