<script setup lang="ts">
import { ref, watch } from "vue";
import AppBottomSheet from "./AppBottomSheet.vue";

const open = defineModel<boolean>("open", { required: true });

type Type = "feedback" | "feature" | "bug";
const type = ref<Type>("feedback");
const email = ref("");
const messageText = ref("");

type Status = "idle" | "sending" | "done" | "error";
const status = ref<Status>("idle");
const message = ref<string | null>(null);

watch(open, (isOpen) => {
  if (isOpen) {
    status.value = "idle";
    message.value = null;
    type.value = "feedback";
    email.value = "";
    messageText.value = "";
  }
});

const sendFeedback = async () => {
  if (!messageText.value.trim()) return;
  status.value = "sending";
  message.value = null;

  try {
    const baseUrl = import.meta.env.VITE_API_BASE_URL;
    if (!baseUrl) {
      throw new Error("API base URL is not configured.");
    }

    const payload = {
      type: type.value,
      email: email.value.trim() || null,
      message: messageText.value.trim(),
    };

    const res = await fetch(`${baseUrl}/feedback`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(errText || `Server returned status ${res.status}`);
    }

    status.value = "done";
    message.value = "Thank you! Your feedback has been recorded.";
    messageText.value = "";
  } catch (err) {
    status.value = "error";
    message.value = (err as Error).message;
  }
};

const close = () => {
  open.value = false;
};
</script>

<template>
  <AppBottomSheet
    v-model:open="open"
    title="Feedback & Requests"
    z-index="z-[55]"
  >
    <div class="flex flex-col gap-5 px-5 py-5 select-none">
      <p class="text-sm text-text-light dark:text-text-dark opacity-70">
        Have feedback, a feature request, or found a bug? Let us know!
      </p>

      <!-- Success State -->
      <div
        v-if="status === 'done'"
        class="flex flex-col items-center text-center gap-3 py-6"
      >
        <span
          class="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent animate-bounce"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>
        <h3 class="text-base font-bold text-text-h-light dark:text-text-h-dark">
          Feedback Submitted
        </h3>
        <p class="text-sm text-text-light dark:text-text-dark opacity-70">
          {{ message }}
        </p>
      </div>

      <template v-else>
        <!-- Type Selection -->
        <div class="flex flex-col gap-2">
          <label
            class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
          >
            Type
          </label>
          <div
            class="flex gap-1 p-1 bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl"
          >
            <button
              v-for="opt in [
                { id: 'feedback', label: 'General' },
                { id: 'feature', label: 'Feature' },
                { id: 'bug', label: 'Bug' },
              ]"
              :key="opt.id"
              type="button"
              :class="
                type === opt.id
                  ? 'bg-accent text-bg-dark'
                  : 'text-text-light dark:text-text-dark hover:text-text-h-light dark:hover:text-text-h-dark'
              "
              class="flex-1 text-xs font-bold py-2 px-2 rounded-lg cursor-pointer transition-colors duration-150"
              @click="type = opt.id as Type"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>

        <!-- Email (Optional) -->
        <div class="flex flex-col gap-2">
          <label
            class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
          >
            Email (Optional)
          </label>
          <input
            v-model="email"
            type="email"
            placeholder="your-email@example.com"
            class="rounded-lg border border-border-light bg-surface-light px-3 py-2.5 text-sm text-text-h-light placeholder-text-light/40 focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/40 dark:border-border-dark dark:bg-surface-dark dark:text-text-h-dark dark:placeholder-text-dark/40"
          />
        </div>

        <!-- Message -->
        <div class="flex flex-col gap-2">
          <label
            class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
          >
            Message
          </label>
          <textarea
            v-model="messageText"
            rows="4"
            placeholder="Describe your feedback, request, or issue..."
            class="rounded-lg border border-border-light bg-surface-light px-3 py-2 text-sm text-text-h-light placeholder-text-light/40 focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/40 dark:border-border-dark dark:bg-surface-dark dark:text-text-h-dark dark:placeholder-text-dark/40 resize-none"
          ></textarea>
        </div>

        <!-- Error status message -->
        <p v-if="status === 'error'" class="text-sm text-red-500">
          {{ message }}
        </p>

        <!-- Submit Button -->
        <button
          class="flex items-center justify-center gap-2 rounded-lg bg-accent py-3 text-sm font-bold text-bg-dark transition-colors duration-150 hover:bg-accent-hover cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          :disabled="status === 'sending' || !messageText.trim()"
          @click="sendFeedback"
        >
          <svg
            v-if="status === 'sending'"
            class="animate-spin -ml-1 mr-2 h-4 w-4 text-bg-dark"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              class="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              stroke-width="4"
            ></circle>
            <path
              class="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
          {{ status === "sending" ? "Sending..." : "Submit" }}
        </button>
      </template>
    </div>

    <template #footer>
      <button
        class="flex-1 rounded-lg border border-border-light dark:border-border-dark py-3 text-sm font-bold text-text-light dark:text-text-dark transition-colors duration-150 hover:bg-surface-light dark:hover:bg-surface-dark cursor-pointer"
        @click="close"
      >
        {{ status === "done" ? "Close" : "Cancel" }}
      </button>
    </template>
  </AppBottomSheet>
</template>
