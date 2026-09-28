import type * as fs from "fs";

/**
 * Identity of a file's current contents derived from `stat` alone:
 * inode, size and mtime. Used to reuse metadata and parse results across
 * refreshes without re-reading unchanged Gemini chat files.
 */
export function fileSignature(stat: fs.Stats): string {
  return `${stat.ino}:${stat.size}:${stat.mtimeMs}`;
}
