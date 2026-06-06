// True on touch-primary devices (phones, tablets). Used to enable the on-screen
// numeric keypad and Enter-based field navigation only where there is no
// physical keyboard.
export const isTouchDevice =
  typeof window !== "undefined" &&
  window.matchMedia("(pointer: coarse)").matches;
