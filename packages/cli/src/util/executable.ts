import { accessSync, constants } from "fs";
import path from "path";

export function commandExistsOnPath(command: string, pathEnv = process.env.PATH ?? ""): boolean {
  for (const directory of pathEnv.split(path.delimiter)) {
    if (!directory) continue;
    try {
      accessSync(path.join(directory, command), constants.X_OK);
      return true;
    } catch {
      // Not in this directory; keep scanning PATH.
    }
  }
  return false;
}
