import { describe, it, expect, beforeEach, vi } from "vitest";
import { nextTick } from "vue";

// Node 22+ exposes an experimental `localStorage` global that shadows jsdom's.
// Stub it with a simple in-memory implementation so the composables can read
// and write storage without requiring the --localstorage-file flag.
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string): string | null => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();
vi.stubGlobal("localStorage", localStorageMock);

// ─── useWeightUnit ───────────────────────────────────────────────────────────

describe("useWeightUnit", () => {
  // Reset the module-scoped singleton between suites so unit state is clean.
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  const getComposable = async () => {
    const mod = await import("../useWeightUnit");
    return mod.useWeightUnit();
  };

  it("defaults to kg when nothing is stored", async () => {
    const { unit } = await getComposable();
    expect(unit.value).toBe("kg");
  });

  it("reads stored unit from localStorage", async () => {
    localStorage.setItem("yafa:weightUnit", "lbs");
    const { unit } = await getComposable();
    expect(unit.value).toBe("lbs");
  });

  it("setUnit persists to localStorage and updates the singleton", async () => {
    const { unit, setUnit } = await getComposable();
    setUnit("lbs");
    expect(unit.value).toBe("lbs");
    expect(localStorage.getItem("yafa:weightUnit")).toBe("lbs");
    setUnit("kg");
    expect(unit.value).toBe("kg");
    expect(localStorage.getItem("yafa:weightUnit")).toBe("kg");
  });

  describe("toDisplay (kg → active unit)", () => {
    it("returns kg unchanged when unit is kg", async () => {
      const { toDisplay, setUnit } = await getComposable();
      setUnit("kg");
      expect(toDisplay(82.5)).toBe(82.5);
      expect(toDisplay(0)).toBe(0);
    });

    it("converts kg to lbs", async () => {
      const { toDisplay, setUnit } = await getComposable();
      setUnit("lbs");
      // 1 kg = 1 / 0.45359237 ≈ 2.20462 lbs
      expect(toDisplay(1)).toBeCloseTo(2.20462, 4);
      expect(toDisplay(100)).toBeCloseTo(220.462, 2);
    });
  });

  describe("toKg (active unit → kg)", () => {
    it("returns value unchanged when unit is kg", async () => {
      const { toKg, setUnit } = await getComposable();
      setUnit("kg");
      expect(toKg(82.5)).toBe(82.5);
    });

    it("converts lbs to kg", async () => {
      const { toKg, setUnit } = await getComposable();
      setUnit("lbs");
      // 1 lb = 0.45359237 kg
      expect(toKg(1)).toBeCloseTo(0.45359237, 8);
      expect(toKg(100)).toBeCloseTo(45.359237, 4);
    });
  });

  it("round-trips with no precision loss beyond expected rounding", async () => {
    const { toDisplay, toKg, setUnit } = await getComposable();
    setUnit("lbs");
    const original = 82.5;
    const roundTripped = toKg(toDisplay(original));
    expect(roundTripped).toBeCloseTo(original, 8);
  });

  describe("display (rounded for input prefilling)", () => {
    it("rounds kg values to 1 decimal by default", async () => {
      const { display, setUnit } = await getComposable();
      setUnit("kg");
      expect(display(82.55)).toBe(82.6);
      expect(display(82.54)).toBe(82.5);
    });

    it("rounds lbs values to specified decimals", async () => {
      const { display, setUnit } = await getComposable();
      setUnit("lbs");
      // 82.5 kg → ~181.881 lbs → 181.9 at 1 decimal
      expect(display(82.5, 1)).toBeCloseTo(181.9, 0);
      expect(display(82.5, 0)).toBe(182);
    });
  });

  describe("format (value + unit label)", () => {
    it("formats kg values", async () => {
      const { format, setUnit } = await getComposable();
      setUnit("kg");
      expect(format(82.5)).toBe("82.5 kg");
    });

    it("formats lbs values", async () => {
      const { format, setUnit } = await getComposable();
      setUnit("lbs");
      expect(format(82.5, 1)).toMatch(/lbs$/);
    });
  });
});

// ─── useLengthUnit ───────────────────────────────────────────────────────────

describe("useLengthUnit", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  const getComposable = async () => {
    const mod = await import("../useLengthUnit");
    return mod.useLengthUnit();
  };

  it("defaults to cm when nothing is stored", async () => {
    const { unit } = await getComposable();
    expect(unit.value).toBe("cm");
  });

  it("reads stored unit from localStorage", async () => {
    localStorage.setItem("yafa:lengthUnit", "in");
    const { unit } = await getComposable();
    expect(unit.value).toBe("in");
  });

  it("setUnit persists to localStorage and updates the singleton", async () => {
    const { unit, setUnit } = await getComposable();
    setUnit("in");
    expect(unit.value).toBe("in");
    expect(localStorage.getItem("yafa:lengthUnit")).toBe("in");
    setUnit("cm");
    expect(unit.value).toBe("cm");
  });

  describe("toDisplay (cm → active unit)", () => {
    it("returns cm unchanged when unit is cm", async () => {
      const { toDisplay, setUnit } = await getComposable();
      setUnit("cm");
      expect(toDisplay(180)).toBe(180);
      expect(toDisplay(0)).toBe(0);
    });

    it("converts cm to inches", async () => {
      const { toDisplay, setUnit } = await getComposable();
      setUnit("in");
      // 2.54 cm = 1 in
      expect(toDisplay(2.54)).toBeCloseTo(1.0, 8);
      expect(toDisplay(180)).toBeCloseTo(70.866, 2);
    });
  });

  describe("toCm (active unit → cm)", () => {
    it("returns value unchanged when unit is cm", async () => {
      const { toCm, setUnit } = await getComposable();
      setUnit("cm");
      expect(toCm(180)).toBe(180);
    });

    it("converts inches to cm", async () => {
      const { toCm, setUnit } = await getComposable();
      setUnit("in");
      expect(toCm(1)).toBeCloseTo(2.54, 8);
      expect(toCm(70)).toBeCloseTo(177.8, 4);
    });
  });

  it("round-trips with no precision loss beyond expected rounding", async () => {
    const { toDisplay, toCm, setUnit } = await getComposable();
    setUnit("in");
    const original = 180;
    expect(toCm(toDisplay(original))).toBeCloseTo(original, 8);
  });

  describe("display (rounded for input prefilling)", () => {
    it("rounds cm to 1 decimal by default", async () => {
      const { display, setUnit } = await getComposable();
      setUnit("cm");
      expect(display(180.55)).toBe(180.6);
      expect(display(180.54)).toBe(180.5);
    });

    it("rounds inches to specified decimals", async () => {
      const { display, setUnit } = await getComposable();
      setUnit("in");
      // 180 cm → 70.866 in → 70.9 at 1 decimal
      expect(display(180, 1)).toBeCloseTo(70.9, 0);
      expect(display(2.54, 2)).toBe(1.0);
    });
  });

  describe("format (value + unit label)", () => {
    it("formats cm values", async () => {
      const { format, setUnit } = await getComposable();
      setUnit("cm");
      expect(format(180)).toBe("180 cm");
    });

    it("formats inch values", async () => {
      const { format, setUnit } = await getComposable();
      setUnit("in");
      expect(format(2.54, 1)).toBe("1 in");
    });
  });
});

// ─── useUnitField ─────────────────────────────────────────────────────────────

describe("useUnitField", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  it("initialises buffer from the model value in the active unit", async () => {
    const { useUnitField } = await import("../useUnitField");
    const { useWeightUnit } = await import("../useWeightUnit");
    const { setUnit, toDisplay, toKg } = useWeightUnit();
    const { useWeightUnit: wu2 } = await import("../useWeightUnit");
    const { unit } = wu2();
    setUnit("kg");

    let storedKg = 82.5;
    const field = useUnitField({
      unit,
      toDisplay,
      toBase: toKg,
      getBase: () => storedKg,
      setBase: (kg) => {
        storedKg = kg ?? 0;
      },
      decimals: 1,
    });

    expect(field.buffer.value).toBe("82.5");
  });

  it("does not re-sync buffer while editing (onFocus guard)", async () => {
    const { useUnitField } = await import("../useUnitField");
    const { useWeightUnit } = await import("../useWeightUnit");
    const { setUnit, toDisplay, toKg, unit } = useWeightUnit();
    setUnit("kg");

    let storedKg = 80;
    const field = useUnitField({
      unit,
      toDisplay,
      toBase: toKg,
      getBase: () => storedKg,
      setBase: (kg) => {
        storedKg = kg ?? 0;
      },
      decimals: 1,
    });

    field.onFocus();
    field.buffer.value = "80."; // user typing — trailing dot
    storedKg = 90; // model changes externally
    await nextTick();
    // buffer must NOT be overwritten while editing
    expect(field.buffer.value).toBe("80.");
  });

  it("commit() converts buffer to base unit and re-syncs", async () => {
    const { useUnitField } = await import("../useUnitField");
    const { useWeightUnit } = await import("../useWeightUnit");
    const { setUnit, toDisplay, toKg, unit } = useWeightUnit();
    setUnit("lbs");

    let storedKg = 0;
    const field = useUnitField({
      unit,
      toDisplay,
      toBase: toKg,
      getBase: () => storedKg,
      setBase: (kg) => {
        storedKg = kg ?? 0;
      },
      decimals: 1,
    });

    field.onFocus();
    field.buffer.value = "220.46"; // ≈ 100 kg in lbs
    const committed = field.commit();

    expect(committed).toBeCloseTo(100, 1);
    expect(storedKg).toBeCloseTo(100, 1);
    expect(field.editing.value).toBe(false);
  });

  it("commit() clears model when buffer is empty or invalid", async () => {
    const { useUnitField } = await import("../useUnitField");
    const { useWeightUnit } = await import("../useWeightUnit");
    const { setUnit, toDisplay, toKg, unit } = useWeightUnit();
    setUnit("kg");

    let storedKg: number | null = 80;
    const field = useUnitField({
      unit,
      toDisplay,
      toBase: toKg,
      getBase: () => storedKg,
      setBase: (kg) => {
        storedKg = kg;
      },
      decimals: 1,
    });

    field.onFocus();
    field.buffer.value = "";
    field.commit();

    expect(storedKg).toBeNull();
    expect(field.buffer.value).toBe("");
  });

  it("buffer re-syncs when unit changes while not editing", async () => {
    const { useUnitField } = await import("../useUnitField");
    const { useWeightUnit } = await import("../useWeightUnit");
    const { setUnit, toDisplay, toKg, unit } = useWeightUnit();
    setUnit("kg");

    const storedKg = 100;
    const field = useUnitField({
      unit,
      toDisplay,
      toBase: toKg,
      getBase: () => storedKg,
      setBase: () => {},
      decimals: 1,
    });

    expect(field.buffer.value).toBe("100"); // kg

    setUnit("lbs");
    await nextTick();

    // 100 kg → ~220.5 lbs
    expect(parseFloat(field.buffer.value)).toBeCloseTo(220.5, 0);
  });
});
