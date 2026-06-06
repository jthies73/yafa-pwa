import { ref, watch, onUnmounted } from "vue";

export function useWorkoutTimer(getStartTime: () => number | undefined) {
  const timerString = ref("00:00");
  let intervalId: any = null;

  const updateTimer = () => {
    const startTime = getStartTime();
    if (!startTime) {
      timerString.value = "00:00";
      return;
    }
    const diff = Date.now() - startTime;
    const totalSeconds = Math.floor(diff / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      timerString.value = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    } else {
      timerString.value = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    }
  };

  watch(
    getStartTime,
    (newStartTime) => {
      if (intervalId) clearInterval(intervalId);
      if (newStartTime) {
        updateTimer();
        intervalId = setInterval(updateTimer, 1000);
      } else {
        timerString.value = "00:00";
      }
    },
    { immediate: true },
  );

  onUnmounted(() => {
    if (intervalId) clearInterval(intervalId);
  });

  return {
    timerString,
  };
}
