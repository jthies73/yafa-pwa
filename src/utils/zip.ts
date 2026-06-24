import { zipSync, unzipSync, strToU8, strFromU8, type Zippable } from "fflate";

// Thin fflate wrappers. Keys with "/" become folders inside the archive, so a
// flat path → text map is all the rest of the export/import code deals with.

/** Zip a `path → text` map into archive bytes. Paths may contain "/" for folders. */
export function zipTextFiles(
  files: Record<string, string>,
): Uint8Array<ArrayBuffer> {
  const tree: Zippable = {};
  for (const [path, text] of Object.entries(files)) {
    tree[path] = strToU8(text);
  }
  // Re-wrap so the bytes are backed by a plain ArrayBuffer (a valid BlobPart).
  return new Uint8Array(zipSync(tree));
}

/** Read one entry's text out of archive bytes, or null if it isn't present. */
export function readZipText(bytes: Uint8Array, name: string): string | null {
  const entry = unzipSync(bytes, { filter: (f) => f.name === name })[name];
  return entry ? strFromU8(entry) : null;
}
