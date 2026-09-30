import { realpathSync } from "fs";
import { fileURLToPath } from "url";

// npx and global installs launch the bin symlink, so argv[1] is the link while
// import.meta.url is the resolved file. Compare real paths.
export function isMainModule(argv1: string | undefined, moduleUrl: string): boolean {
  if (!argv1) {
    return false;
  }
  try {
    return realpathSync(argv1) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}
