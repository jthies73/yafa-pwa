import { db } from "../db/db";
import { DEFAULT_RPE_MATRIX } from "../db/rpeMatrix";
import { isQualifyingSet, impliedE1rm } from "../engine/matrix";
import { useWeightUnit } from "../composables/useWeightUnit";

function escapeCsvCell(val: any): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatDate(timestamp: number): string {
  const d = new Date(timestamp);
  const pad = (n: number) => n.toString().padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

export async function exportToExcelCsv(): Promise<void> {
  // 1. Fetch all data
  const [plans, routines, exercises, workouts] = await Promise.all([
    db.plans.toArray(),
    db.routines.toArray(),
    db.exercises.toArray(),
    db.workouts.toArray(),
  ]);

  const { unit, display } = useWeightUnit();
  const unitLabel = unit.value;

  const exercisesMap = new Map(exercises.map((e) => [e.id, e]));
  const routinesMap = new Map(routines.map((r) => [r.id, r]));

  // Track which plans contain which routines
  const routinePlansMap = new Map<string, string[]>();
  for (const plan of plans) {
    for (const rId of plan.routineIds) {
      const list = routinePlansMap.get(rId) || [];
      list.push(plan.name);
      routinePlansMap.set(rId, list);
    }
  }

  const csvRows: string[] = [];

  // ==========================================
  // SECTION 1: Plans & Routines Structure
  // ==========================================
  csvRows.push("PLANS & ROUTINES TEMPLATES STRUCTURE");
  csvRows.push(
    [
      "Plan",
      "Routine",
      "Exercise",
      "Primary Muscle Groups",
      "Secondary Muscle Groups",
      "Progression Model",
      "Target Sets",
      "Target Reps / Range",
      "Target RPE",
      `Weight Increment (${unitLabel})`,
      "Notes",
    ]
      .map(escapeCsvCell)
      .join(",")
  );

  // Helper to format a routine exercise row
  const addRoutineExerciseRow = (
    planName: string,
    routineName: string,
    rEx: any
  ) => {
    const exercise = exercisesMap.get(rEx.exerciseId);
    const config = rEx.config;
    const model = config?.progressionModel;
    const p = config?.progressionParams;

    let progressionLabel = "";
    if (model === "linear") progressionLabel = "Linear";
    else if (model === "double") progressionLabel = "Double";
    else if (model === "topset_backoff") progressionLabel = "Top Set + Back-Off";
    else if (model === "none") progressionLabel = "None";

    let targetSets = "";
    let targetRepsRange = "";
    let targetRpe = "";
    let weightIncrement = "";

    if (p) {
      if (model === "linear") {
        targetSets = String(p.targetSets ?? "");
        targetRepsRange = String(p.targetReps ?? "");
        targetRpe = String(p.targetRpe ?? "");
      } else if (model === "double") {
        targetSets = String(p.targetSets ?? "");
        targetRepsRange = `${p.minReps ?? ""}–${p.maxReps ?? ""}`;
        targetRpe = String(p.targetRpe ?? "");
      } else if (model === "topset_backoff") {
        const topSets = 1;
        const boSets = p.backOffSets ?? 0;
        targetSets = `${topSets} Top, ${boSets} Back-Off`;
        targetRepsRange = `Top: ${p.topSetTargetReps ?? ""}, Back-Off: ${p.backOffReps ?? ""}`;
        targetRpe = `Top: ${p.topSetTargetRpe ?? ""}`;
      } else if (model === "none") {
        targetSets = String(p.targetSets ?? "");
        targetRepsRange = String(p.targetReps ?? "");
        targetRpe = String(p.targetRpe ?? "");
      }

      if (p.weightIncrement !== undefined) {
        if (p.incrementUnit === "percent") {
          weightIncrement = `${p.weightIncrement}%`;
        } else {
          // Convert kg target weight increment to active unit (display)
          weightIncrement = String(display(p.weightIncrement));
        }
      }
    }

    csvRows.push(
      [
        planName,
        routineName,
        exercise ? exercise.name : rEx.exerciseId,
        exercise ? exercise.primaryMuscleGroups.join(", ") : "",
        exercise && exercise.secondaryMuscleGroups ? exercise.secondaryMuscleGroups.join(", ") : "",
        progressionLabel,
        targetSets,
        targetRepsRange,
        targetRpe,
        weightIncrement,
        config?.notes || "",
      ]
        .map(escapeCsvCell)
        .join(",")
    );
  };

  // Add plan-based routines
  for (const plan of plans) {
    for (const rId of plan.routineIds) {
      const routine = routinesMap.get(rId);
      if (!routine) continue;
      for (const rEx of routine.exercises) {
        addRoutineExerciseRow(plan.name, routine.name, rEx);
      }
    }
  }

  // Add routines not linked to any plan
  const planRoutineIds = new Set(plans.flatMap((p) => p.routineIds));
  for (const routine of routines) {
    if (!planRoutineIds.has(routine.id)) {
      for (const rEx of routine.exercises) {
        addRoutineExerciseRow("", routine.name, rEx);
      }
    }
  }

  // Add blank separation lines
  csvRows.push("");
  csvRows.push("");
  csvRows.push("");

  // ==========================================
  // SECTION 2: Workout History
  // ==========================================
  csvRows.push("WORKOUT HISTORY LOGS");
  csvRows.push(
    [
      "Date",
      "Plan(s)",
      "Routine",
      "Exercise",
      "Set Number",
      "Target Reps",
      "Actual Reps",
      `Target Weight (${unitLabel})`,
      `Actual Weight (${unitLabel})`,
      "Target RPE",
      "Actual RPE",
      `Estimated 1RM (${unitLabel})`,
    ]
      .map(escapeCsvCell)
      .join(",")
  );

  // Sort workouts chronologically by start time
  const sortedWorkouts = [...workouts].sort((a, b) => a.startTime - b.startTime);

  for (const workout of sortedWorkouts) {
    const routine = routinesMap.get(workout.routineId);
    const routineName = routine ? routine.name : "Unknown Routine";
    const planNames = routinePlansMap.get(workout.routineId) || [];
    const plansString = planNames.join(", ");
    const workoutDate = formatDate(workout.startTime);

    for (const wEx of workout.exercises) {
      const exercise = exercisesMap.get(wEx.exerciseId);
      const exerciseName = exercise ? exercise.name : "Unknown Exercise";
      const matrix = exercise?.rpeMatrix ?? DEFAULT_RPE_MATRIX;

      wEx.sets.forEach((set, idx) => {
        const isQualifying = isQualifyingSet(set);
        let e1rmDisplay = "";
        if (isQualifying) {
          const e1rmKg = impliedE1rm(matrix, set.actualWeight, set.actualReps, set.actualRpe!);
          e1rmDisplay = String(display(e1rmKg));
        }

        csvRows.push(
          [
            workoutDate,
            plansString,
            routineName,
            exerciseName,
            idx + 1,
            set.targetReps,
            set.actualReps,
            display(set.targetWeight),
            display(set.actualWeight),
            set.targetRpe ?? "",
            set.actualRpe ?? "",
            e1rmDisplay,
          ]
            .map(escapeCsvCell)
            .join(",")
        );
      });
    }
  }

  // 2. Trigger browser download
  const csvContent = csvRows.join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const dateStr = new Date().toISOString().slice(0, 10);
  const a = document.createElement("a");
  a.href = url;
  a.download = `yafa-export-${dateStr}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
