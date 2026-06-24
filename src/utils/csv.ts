// Shared CSV primitives. One place for cell escaping, row joining and the
// human-readable timestamp format used across every CSV the app emits.

export type CsvCell = string | number | null | undefined;

/** RFC-4180 escaping: wrap in quotes and double any quote when the cell needs it. */
export function escapeCsvCell(val: CsvCell): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/** Escape each cell and join into one CSV line. */
export function csvRow(...cells: CsvCell[]): string {
  return cells.map(escapeCsvCell).join(",");
}

/** Render rows (the first is usually the header) into a CSV document. */
export function csvTable(rows: CsvCell[][]): string {
  return rows.map((cells) => csvRow(...cells)).join("\n");
}

const pad = (n: number): string => String(n).padStart(2, "0");

/** "YYYY-MM-DD HH:mm" in local time — readable and Excel-friendly. */
export function formatDateTime(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "YYYY-MM-DD" in local time. */
export function formatDate(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
