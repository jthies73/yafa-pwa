import { ref } from "vue";
import { hasSeenIntro } from "../config/intro";

const open = ref(false);

export function useIntroSheet() {
  function showIfFirstOpen() {
    if (!hasSeenIntro(localStorage)) open.value = true;
  }

  function reopen() {
    open.value = true;
  }

  return { open, showIfFirstOpen, reopen };
}
