// Browser file-download helpers. Factors out the Blob + anchor pattern so
// callers don't re-implement object-URL lifecycle each time.

/** Trigger a browser download of `blob` under `filename`. */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Trigger a download of `csv` as a UTF-8 .csv file named `filename`. */
export function downloadCsv(filename: string, csv: string): void {
  downloadBlob(filename, new Blob([csv], { type: "text/csv;charset=utf-8;" }));
}

/** "Chest, Triceps" → "chest-triceps" — safe, readable filename fragment. */
export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "chart"
  );
}
