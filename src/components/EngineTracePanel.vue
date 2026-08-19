<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { liveQuery } from "dexie";
import { traceHistory } from "../engine/service";
import type { FoldTrace, TraceReason } from "../engine/replay";
import { useWeightUnit } from "../composables/useWeightUnit";
import EngineTraceSheet from "./EngineTraceSheet.vue";
import ListPickerSheet, { type ListPickerOption } from "./ListPickerSheet.vue";
import { REASON_FILTERS, REASON_LABEL, REASON_TONE } from "./engineTraceLabels";

// Engine debugging view: a deterministic replay of every fold in history, so a
// progression, hold or reset can be traced back to the sets that caused it.
// Read-only — replaying never touches stored progression state.

const { format: fmtWeight } = useWeightUnit();

const traces = ref<FoldTrace[]>([]);
const loading = ref(true);
let subscription: { unsubscribe(): void } | undefined;

onMounted(() => {
  // liveQuery tracks the reads inside traceHistory, so the replay refreshes
  // whenever a workout, routine, plan or bodyweight entry changes.
  subscription = liveQuery(() => traceHistory()).subscribe({
    next: (result) => {
      traces.value = result;
      loading.value = false;
    },
    error: (err) => {
      console.error("Error replaying engine history:", err);
      loading.value = false;
    },
  });
});

onUnmounted(() => subscription?.unsubscribe());

// --- Filters ---
const reasonFilter = ref<TraceReason | "all">("all");
const exerciseFilter = ref<string | "all">("all");
const pickerOpen = ref(false);

const exerciseOptions = computed<ListPickerOption[]>(() => {
  const counts = new Map<string, { name: string; count: number }>();
  for (const t of traces.value) {
    const entry = counts.get(t.exerciseId);
    if (entry) entry.count += 1;
    else counts.set(t.exerciseId, { name: t.exerciseName, count: 1 });
  }
  return [
    { value: "all", label: "All exercises" },
    ...[...counts.entries()]
      .sort((a, b) => a[1].name.localeCompare(b[1].name))
      .map(([id, { name, count }]) => ({
        value: id,
        label: name,
        sub: `${count} session${count === 1 ? "" : "s"}`,
      })),
  ];
});

const exerciseFilterLabel = computed(
  () =>
    exerciseOptions.value.find((o) => o.value === exerciseFilter.value)
      ?.label ?? "All exercises",
);

/** Newest first — debugging starts from what just happened. */
const filtered = computed(() =>
  traces.value
    .filter(
      (t) =>
        (reasonFilter.value === "all" || t.reason === reasonFilter.value) &&
        (exerciseFilter.value === "all" ||
          t.exerciseId === exerciseFilter.value),
    )
    .slice()
    .reverse(),
);

/** Consecutive traces from one workout render under a single date header. */
const groups = computed(() => {
  const out: {
    key: string;
    label: string;
    routineName: string;
    traces: FoldTrace[];
  }[] = [];
  for (const t of filtered.value) {
    const last = out[out.length - 1];
    if (last?.key === t.workoutId) last.traces.push(t);
    else
      out.push({
        key: t.workoutId,
        label: new Date(t.startTime).toLocaleDateString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
        routineName: t.routineName,
        traces: [t],
      });
  }
  return out;
});

// --- Detail ---
const activeTrace = ref<FoldTrace | null>(null);
const detailOpen = ref(false);

const openTrace = (trace: FoldTrace) => {
  activeTrace.value = trace;
  detailOpen.value = true;
};

/** "126.6 → 129.1 kg" for the anchor move, or just the seeded value. */
const anchorMove = (t: FoldTrace): string => {
  if (t.before.c1rm == null)
    return t.after.c1rm != null ? fmtWeight(t.after.c1rm, 0) : "—";
  if (t.after.c1rm == null || t.after.c1rm === t.before.c1rm)
    return fmtWeight(t.before.c1rm, 0);
  return `${fmtWeight(t.before.c1rm, 0)} → ${fmtWeight(t.after.c1rm, 0)}`;
};
</script>

<template>
  <div class="flex flex-col gap-5">
    <!-- What this view is -->
    <p class="text-xs text-text-light dark:text-text-dark opacity-60">
      Every fold the engine performed, replayed from history under the current
      rules — tap one to see which sets it was decided from.
    </p>

    <!-- Filters -->
    <div class="flex flex-col gap-3">
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="option in REASON_FILTERS"
          :key="option.value"
          class="rounded-lg px-2.5 py-1 text-xs font-bold cursor-pointer transition-colors duration-150"
          :class="
            reasonFilter === option.value
              ? 'bg-accent text-bg-dark'
              : 'bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark hover:text-text-h-light dark:hover:text-text-h-dark'
          "
          @click="reasonFilter = option.value"
        >
          {{ option.label }}
        </button>
      </div>

      <button
        class="flex items-center justify-between gap-3 rounded-xl border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark px-3.5 py-2.5 text-left cursor-pointer transition-colors duration-150 hover:bg-surface-light-hover dark:hover:bg-surface-dark-hover"
        @click="pickerOpen = true"
      >
        <span
          class="text-[10px] font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-40"
        >
          Exercise
        </span>
        <span
          class="truncate text-sm font-semibold text-text-h-light dark:text-text-h-dark"
        >
          {{ exerciseFilterLabel }}
        </span>
      </button>
    </div>

    <!-- States -->
    <div
      v-if="loading"
      class="text-sm italic text-text-light dark:text-text-dark opacity-60"
    >
      Replaying history…
    </div>
    <div
      v-else-if="groups.length === 0"
      class="text-sm italic text-text-light dark:text-text-dark opacity-60"
    >
      No folds match this filter.
    </div>

    <!-- Grouped folds -->
    <div v-else class="flex flex-col gap-6">
      <section v-for="group in groups" :key="group.key">
        <div class="mb-2 flex items-baseline justify-between gap-3">
          <h3
            class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-50"
          >
            {{ group.label }}
          </h3>
          <span
            class="truncate text-xs text-text-light dark:text-text-dark opacity-40"
          >
            {{ group.routineName }}
          </span>
        </div>

        <div class="flex flex-col gap-2">
          <button
            v-for="trace in group.traces"
            :key="`${trace.workoutId}-${trace.exerciseId}`"
            class="flex w-full items-center gap-3 rounded-xl border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark px-3.5 py-3 text-left cursor-pointer transition-colors duration-150 hover:bg-surface-light-hover dark:hover:bg-surface-dark-hover"
            @click="openTrace(trace)"
          >
            <div class="flex min-w-0 flex-1 flex-col gap-1">
              <span
                class="truncate text-sm font-bold text-text-h-light dark:text-text-h-dark"
              >
                {{ trace.exerciseName }}
              </span>
              <div class="flex flex-wrap items-center gap-1.5">
                <span
                  class="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                  :class="REASON_TONE[trace.reason]"
                >
                  {{ REASON_LABEL[trace.reason] }}
                </span>
                <span
                  v-if="trace.resetConsumed"
                  class="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-500"
                >
                  −10% applied
                </span>
                <span
                  v-if="trace.resetArmed"
                  class="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-500"
                >
                  Reset armed
                </span>
                <span
                  v-else-if="trace.after.regressionStreak > 0"
                  class="rounded bg-surface-light dark:bg-surface-dark px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-70"
                >
                  Streak {{ trace.after.regressionStreak }}/{{
                    trace.resetTrigger
                  }}
                </span>
              </div>
            </div>
            <span
              class="shrink-0 font-mono text-xs text-text-h-light dark:text-text-h-dark"
            >
              {{ anchorMove(trace) }}
            </span>
          </button>
        </div>
      </section>
    </div>

    <ListPickerSheet
      v-model:open="pickerOpen"
      title="Filter by exercise"
      :options="exerciseOptions"
      @select="
        (value) => {
          exerciseFilter = value;
          pickerOpen = false;
        }
      "
    />

    <EngineTraceSheet v-model:open="detailOpen" :trace="activeTrace" />
  </div>
</template>
