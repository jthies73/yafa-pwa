<script setup lang="ts">
import { computed } from "vue";
import type { FoldTrace, SetTrace, TraceReason } from "../engine/replay";
import type { RuleCheck } from "../engine/evaluation";
import { useWeightUnit } from "../composables/useWeightUnit";
import AppBottomSheet from "./AppBottomSheet.vue";
import { REASON_LABEL, REASON_TONE } from "./engineTraceLabels";

// The full evidence behind one exercise's fold: which sets the rules examined,
// which one decided the outcome, which fed the capacity math, and how the anchor
// moved as a result. Read-only — a replay of the engine, never a write path.
const props = defineProps<{ trace: FoldTrace | null }>();

const open = defineModel<boolean>("open", { required: true });

const { format: fmtWeight, display: displayWeight, label } = useWeightUnit();

const formatDate = (ts: number): string =>
  new Date(ts).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

const VERDICT: Record<TraceReason, string> = {
  seed: "First session for this exercise — the anchor was seeded from the best honest set and nothing progressed.",
  "off-script":
    "Logged off-script (this exercise is not in the routine), so there was no prescription to judge against.",
  recalibrate:
    "This session's demonstrated capacity diverged past the catch-up threshold, which overrides the rule outcome outright.",
  increment:
    "Every judged set cleared its clause, so the anchor took one increment.",
  regression:
    "The deciding set bottomed out on reps while grinding at the prescribed weight.",
  hold: "Neither the success nor the regression clause was fully met, so the anchor stands.",
};

/** One-line "why", derived from the outcome the rules actually reached. */
const verdict = computed<string>(() =>
  props.trace ? VERDICT[props.trace.reason] : "",
);

/** The clause list that actually settled the outcome. */
const decidingChecks = computed<{ title: string; checks: RuleCheck[] }[]>(
  () => {
    const o = props.trace?.outcome;
    if (!o) return [];
    return [
      { title: "Success clause", checks: o.successChecks },
      ...(o.regressionChecks.length
        ? [{ title: "Regression clause", checks: o.regressionChecks }]
        : []),
    ];
  },
);

/** Prescribed target for a set row, e.g. "100 kg × 5 @ 8". */
const targetOf = (s: SetTrace): string => {
  if (!s.prescribed) return "—";
  const w =
    s.prescribed.weight == null ? "—" : displayWeight(s.prescribed.weight);
  return `${w} × ${s.prescribed.reps}${s.prescribed.rpe != null ? ` @ ${s.prescribed.rpe}` : ""}`;
};

const paramRows = computed<{ label: string; value: string }[]>(() => {
  const t = props.trace;
  if (!t) return [];
  const rows: { label: string; value: string }[] = [];
  if (t.params) {
    for (const [key, value] of Object.entries(t.params)) {
      rows.push({ label: key, value: String(value) });
    }
  }
  if (t.ceiling != null)
    rows.push({ label: "rpeCeiling (effective)", value: String(t.ceiling) });
  if (t.fatigueReductionKg > 0)
    rows.push({
      label: "fatigue reduction",
      value: `−${fmtWeight(t.fatigueReductionKg)}`,
    });
  if (t.bodyweightOffsetKg > 0)
    rows.push({
      label: "bodyweight in load",
      value: `+${fmtWeight(t.bodyweightOffsetKg)}`,
    });
  if (t.after.doubleRepCursor != null)
    rows.push({
      label: "rep cursor",
      value:
        t.before.doubleRepCursor === t.after.doubleRepCursor
          ? String(t.after.doubleRepCursor)
          : `${t.before.doubleRepCursor ?? "—"} → ${t.after.doubleRepCursor}`,
    });
  return rows;
});
</script>

<template>
  <AppBottomSheet v-model:open="open">
    <template #title>
      <div v-if="trace" class="min-w-0">
        <h2
          class="truncate text-lg font-bold text-text-h-light dark:text-text-h-dark"
        >
          {{ trace.exerciseName }}
        </h2>
        <p
          class="truncate text-xs text-text-light dark:text-text-dark opacity-60"
        >
          {{ formatDate(trace.startTime) }} · {{ trace.routineName }}
        </p>
      </div>
    </template>

    <div
      v-if="trace"
      class="flex flex-col divide-y divide-border-light dark:divide-border-dark"
    >
      <!-- Outcome + anchor move -->
      <section class="flex flex-col gap-3 px-5 py-4">
        <div class="flex flex-wrap items-center gap-2">
          <span
            class="rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
            :class="REASON_TONE[trace.reason]"
          >
            {{ REASON_LABEL[trace.reason] }}
          </span>
          <span
            v-if="trace.model !== 'none' || trace.reason !== 'seed'"
            class="font-mono text-[10px] uppercase tracking-wider text-text-light dark:text-text-dark opacity-50"
          >
            {{ trace.model }}
          </span>
          <span
            v-if="trace.focus"
            class="font-mono text-[10px] uppercase tracking-wider text-text-light dark:text-text-dark opacity-50"
          >
            {{ trace.focus }} week
          </span>
        </div>

        <p class="text-xs text-text-light dark:text-text-dark opacity-70">
          {{ verdict }}
        </p>

        <!-- Anchor before → after -->
        <div class="flex items-baseline gap-2 font-mono text-base font-bold">
          <span class="text-text-light dark:text-text-dark opacity-50">
            {{ trace.before.c1rm != null ? fmtWeight(trace.before.c1rm) : "—" }}
          </span>
          <span class="text-sm opacity-40">→</span>
          <span
            :class="
              trace.after.c1rm == null || trace.before.c1rm == null
                ? 'text-accent'
                : trace.after.c1rm > trace.before.c1rm
                  ? 'text-green-600 dark:text-green-400'
                  : trace.after.c1rm < trace.before.c1rm
                    ? 'text-amber-500'
                    : 'text-text-h-light dark:text-text-h-dark'
            "
          >
            {{ trace.after.c1rm != null ? fmtWeight(trace.after.c1rm) : "—" }}
          </span>
          <span
            class="text-[10px] font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-40"
          >
            c1RM
          </span>
        </div>

        <!-- Reset bookkeeping -->
        <div class="flex flex-wrap gap-2">
          <span
            v-if="trace.resetConsumed"
            class="rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-500"
          >
            −10% deload applied at this session's start
          </span>
          <span
            v-if="trace.resetArmed"
            class="rounded-md bg-red-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-500"
          >
            Reset armed — next session −10%
          </span>
          <span
            v-if="trace.after.regressionStreak > 0"
            class="rounded-md bg-surface-light dark:bg-surface-dark px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-text-light dark:text-text-dark"
          >
            Streak {{ trace.after.regressionStreak }}/{{ trace.resetTrigger }}
          </span>
        </div>

        <!-- The sessions that built the streak — the answer to "what caused the reset" -->
        <div v-if="trace.streakChain.length" class="flex flex-col gap-1">
          <span
            class="text-[10px] font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-40"
          >
            Regressed sessions in this streak
          </span>
          <div
            class="flex flex-wrap gap-x-3 gap-y-1 font-mono text-xs text-text-light dark:text-text-dark opacity-70"
          >
            <span v-for="s in trace.streakChain" :key="s.workoutId">
              {{ formatDate(s.startTime) }}
            </span>
          </div>
        </div>
      </section>

      <!-- Sets: what was logged, against what, and what it counted for -->
      <section class="flex flex-col gap-3 px-5 py-4">
        <div class="flex flex-col gap-0.5">
          <span
            class="text-[10px] font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-40"
          >
            Sets
          </span>
          <p class="text-xs text-text-light dark:text-text-dark opacity-60">
            Logged vs the prescription this session was judged against.
          </p>
        </div>

        <ul class="flex flex-col gap-2.5">
          <li
            v-for="(s, i) in trace.sets"
            :key="s.set.id"
            class="flex flex-col gap-1 rounded-lg border px-3 py-2"
            :class="
              s.decider
                ? 'border-accent-border bg-accent-bg'
                : 'border-border-light dark:border-border-dark'
            "
          >
            <div class="flex items-baseline gap-3">
              <span
                class="w-4 shrink-0 font-mono text-xs text-text-light dark:text-text-dark opacity-40"
              >
                {{ i + 1 }}
              </span>
              <div
                class="flex min-w-0 flex-1 items-baseline gap-1.5 font-mono text-sm text-text-h-light dark:text-text-h-dark"
              >
                <span>
                  {{ displayWeight(s.set.actualWeight) }}
                  <span class="text-[10px] opacity-40">{{ label }}</span>
                </span>
                <span class="opacity-30">×</span>
                <span>{{ s.set.actualReps }}</span>
                <template v-if="s.set.actualRpe != null">
                  <span class="opacity-30">@</span>
                  <span>{{ s.set.actualRpe }}</span>
                </template>
              </div>
              <span
                v-if="s.e1rm != null"
                class="shrink-0 font-mono text-xs font-bold text-accent"
              >
                {{ fmtWeight(s.e1rm, 0) }}
                <span class="opacity-60">e1RM</span>
              </span>
            </div>

            <div class="flex flex-wrap items-center gap-x-3 gap-y-1 pl-7">
              <span
                class="font-mono text-[10px] text-text-light dark:text-text-dark opacity-50"
              >
                target {{ targetOf(s) }}
              </span>
              <span
                v-if="s.decider"
                class="rounded bg-accent/20 px-1.5 text-[10px] font-bold uppercase tracking-wider text-accent"
              >
                Decider
              </span>
              <span
                v-else-if="s.judged"
                class="rounded bg-surface-light dark:bg-surface-dark px-1.5 text-[10px] font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-70"
              >
                Judged
              </span>
              <span
                v-else
                class="rounded bg-surface-light dark:bg-surface-dark px-1.5 text-[10px] font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-40"
              >
                Not judged
              </span>
              <span
                v-if="s.qualifying"
                class="rounded bg-surface-light dark:bg-surface-dark px-1.5 text-[10px] font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-70"
              >
                Qualifying
              </span>
              <span
                v-if="s.representative"
                class="rounded bg-accent/20 px-1.5 text-[10px] font-bold uppercase tracking-wider text-accent"
              >
                {{
                  trace.reason === "seed"
                    ? "Seeded from"
                    : "Weighed for capacity"
                }}
              </span>
            </div>
          </li>
        </ul>
      </section>

      <!-- Rule clauses -->
      <section
        v-if="decidingChecks.length"
        class="flex flex-col gap-3 px-5 py-4"
      >
        <div class="flex flex-col gap-0.5">
          <span
            class="text-[10px] font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-40"
          >
            Rules
          </span>
          <p class="text-xs text-text-light dark:text-text-dark opacity-60">
            Success needs every clause; a regression needs every clause of its
            own. Anything else holds.
          </p>
        </div>

        <div
          v-for="group in decidingChecks"
          :key="group.title"
          class="flex flex-col gap-1.5"
        >
          <span
            class="font-mono text-[10px] uppercase tracking-wider text-text-light dark:text-text-dark opacity-50"
          >
            {{ group.title }}
          </span>
          <div
            v-for="(check, i) in group.checks"
            :key="i"
            class="flex items-baseline gap-2 text-xs"
          >
            <span
              class="w-3 shrink-0 font-bold"
              :class="
                check.passed
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-text-light dark:text-text-dark opacity-40'
              "
            >
              {{ check.passed ? "✓" : "✕" }}
            </span>
            <span
              class="flex-1 text-text-h-light dark:text-text-h-dark"
              :class="{ 'opacity-50': !check.passed }"
            >
              {{ check.label }}
            </span>
            <span
              v-if="check.detail"
              class="shrink-0 font-mono text-[10px] text-text-light dark:text-text-dark opacity-50"
            >
              {{ check.detail }}
            </span>
          </div>
        </div>
      </section>

      <!-- Catch-up arithmetic -->
      <section v-if="trace.catchUp" class="flex flex-col gap-3 px-5 py-4">
        <div class="flex flex-col gap-0.5">
          <span
            class="text-[10px] font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-40"
          >
            Catch-up
          </span>
          <p class="text-xs text-text-light dark:text-text-dark opacity-60">
            Demonstrated capacity from this session's qualifying sets (outlier
            dropped). Past ±{{ trace.catchUp.thresholdPct }}% it overrides the
            rule outcome.
          </p>
        </div>
        <dl class="grid grid-cols-2 gap-x-4 gap-y-2">
          <div class="flex flex-col">
            <dt
              class="text-[10px] uppercase tracking-wider text-text-light dark:text-text-dark opacity-40"
            >
              Qualifying sets
            </dt>
            <dd
              class="font-mono text-sm text-text-h-light dark:text-text-h-dark"
            >
              {{ trace.catchUp.qualifyingSets }}
            </dd>
          </div>
          <div class="flex flex-col">
            <dt
              class="text-[10px] uppercase tracking-wider text-text-light dark:text-text-dark opacity-40"
            >
              Demonstrated
            </dt>
            <dd
              class="font-mono text-sm text-text-h-light dark:text-text-h-dark"
            >
              {{
                trace.catchUp.estimate != null
                  ? fmtWeight(trace.catchUp.estimate, 0)
                  : "—"
              }}
            </dd>
          </div>
          <div class="flex flex-col">
            <dt
              class="text-[10px] uppercase tracking-wider text-text-light dark:text-text-dark opacity-40"
            >
              Divergence
            </dt>
            <dd
              class="font-mono text-sm"
              :class="
                trace.catchUp.fired
                  ? 'text-accent font-bold'
                  : 'text-text-h-light dark:text-text-h-dark'
              "
            >
              {{
                trace.catchUp.gapPct != null
                  ? `${trace.catchUp.gapPct > 0 ? "+" : ""}${trace.catchUp.gapPct.toFixed(1)}%`
                  : "—"
              }}
            </dd>
          </div>
          <div class="flex flex-col">
            <dt
              class="text-[10px] uppercase tracking-wider text-text-light dark:text-text-dark opacity-40"
            >
              Fired
            </dt>
            <dd
              class="font-mono text-sm text-text-h-light dark:text-text-h-dark"
            >
              {{ trace.catchUp.fired ? "yes" : "no" }}
            </dd>
          </div>
        </dl>
        <p
          v-if="trace.matrixLearned"
          class="text-xs text-text-light dark:text-text-dark opacity-60"
        >
          This session also refined the exercise's RPE curve (deviation inside
          the learning gate).
        </p>
      </section>

      <!-- Inputs the prescription was rendered from -->
      <section v-if="paramRows.length" class="flex flex-col gap-3 px-5 py-4">
        <div class="flex flex-col gap-0.5">
          <span
            class="text-[10px] font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-40"
          >
            Effective inputs
          </span>
          <p class="text-xs text-text-light dark:text-text-dark opacity-60">
            Config after normalization and the mesocycle week's shifts — what
            the prescription was actually rendered from.
          </p>
        </div>
        <dl class="grid grid-cols-2 gap-x-4 gap-y-1.5">
          <div
            v-for="row in paramRows"
            :key="row.label"
            class="flex items-baseline justify-between gap-2"
          >
            <dt
              class="truncate font-mono text-[10px] text-text-light dark:text-text-dark opacity-50"
            >
              {{ row.label }}
            </dt>
            <dd
              class="shrink-0 font-mono text-xs text-text-h-light dark:text-text-h-dark"
            >
              {{ row.value }}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  </AppBottomSheet>
</template>
