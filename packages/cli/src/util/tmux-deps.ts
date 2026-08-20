import { execFile } from 'child_process';
import { access, readFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import type { InspectTmuxDeps } from './tmux.js';

const execFileAsync = promisify(execFile);

export function createTmuxInspectionDeps(): InspectTmuxDeps {
  return {
    run: (command, args) => execFileAsync(command, [...args]),
    platform: os.platform(),
    readOsRelease: () => readFile('/etc/os-release', 'utf8'),
    releaseText: os.release(),
    which: async command => {
      const directories = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
      for (const directory of directories) {
        try {
          await access(path.join(directory, command));
          return true;
        } catch {
          // Continue searching PATH.
        }
      }
      return false;
    },
  };
}
