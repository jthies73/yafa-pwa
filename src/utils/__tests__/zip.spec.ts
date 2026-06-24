import { describe, it, expect } from "vitest";
import { zipTextFiles, readZipText } from "../zip";

describe("zip round-trip", () => {
  it("reads back an entry written into a folder", () => {
    const json = JSON.stringify({ app: "yafa", data: { exercises: [] } });
    const bytes = zipTextFiles({
      "backup.json": json,
      "exercises/Bench Press.csv": "timestamp,reps,weight,rpe",
    });
    expect(readZipText(bytes, "backup.json")).toBe(json);
    expect(readZipText(bytes, "exercises/Bench Press.csv")).toBe(
      "timestamp,reps,weight,rpe",
    );
  });

  it("returns null for a missing entry", () => {
    const bytes = zipTextFiles({ "a.txt": "hello" });
    expect(readZipText(bytes, "missing.txt")).toBeNull();
  });
});
