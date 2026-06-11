import * as path from 'path';
import {
  validatePluginManifest,
  resolvePluginCommandEntry,
} from '../../../services/plugin/plugin-manifest.service.js';

describe('plugin manifest service', () => {
  describe('validatePluginManifest', () => {
    it('accepts valid aiDevkit command manifests from package.json', () => {
      const manifest = validatePluginManifest('@ai-devkit/memory-dashboard', {
        aiDevkit: {
          commands: [
            {
              name: 'memory-dashboard',
              description: 'Open the memory dashboard',
              entry: './dist/command.js'
            }
          ]
        }
      }, new Set(['memory']));

      expect(manifest.commands).toEqual([
        {
          name: 'memory-dashboard',
          description: 'Open the memory dashboard',
          entry: './dist/command.js'
        }
      ]);
    });

    it('rejects packages without aiDevkit command manifests', () => {
      expect(() => validatePluginManifest('@ai-devkit/bad-plugin', {}, new Set()))
        .toThrow('Plugin @ai-devkit/bad-plugin must define package.json aiDevkit.commands.');
    });

    it('rejects duplicate command names within the same plugin', () => {
      expect(() => validatePluginManifest('@ai-devkit/bad-plugin', {
        aiDevkit: {
          commands: [
            { name: 'memory-dashboard', entry: './dist/one.js' },
            { name: 'memory-dashboard', entry: './dist/two.js' }
          ]
        }
      }, new Set())).toThrow('Plugin @ai-devkit/bad-plugin declares duplicate command "memory-dashboard".');
    });

    it('rejects command names that conflict with built-in commands', () => {
      expect(() => validatePluginManifest('@ai-devkit/bad-plugin', {
        aiDevkit: {
          commands: [
            { name: 'memory', entry: './dist/command.js' }
          ]
        }
      }, new Set(['memory']))).toThrow('Plugin @ai-devkit/bad-plugin command "memory" conflicts with a built-in command.');
    });

    it('rejects command names that include Commander grammar', () => {
      const invalidNames = [
        'memory <query>',
        'memory --table',
        'memory [query]',
        'memory|dashboard',
        'MemoryDashboard',
        '1-dashboard',
      ];

      for (const name of invalidNames) {
        expect(() => validatePluginManifest('@ai-devkit/bad-plugin', {
          aiDevkit: {
            commands: [
              { name, entry: './dist/command.js' }
            ]
          }
        }, new Set())).toThrow(`Plugin @ai-devkit/bad-plugin command "${name}" must use lowercase letters, numbers, and hyphens only, and start with a letter.`);
      }
    });

    it('rejects non-JavaScript command entrypoints', () => {
      expect(() => validatePluginManifest('@ai-devkit/bad-plugin', {
        aiDevkit: {
          commands: [
            { name: 'memory-dashboard', entry: './src/command.ts' }
          ]
        }
      }, new Set())).toThrow('Plugin @ai-devkit/bad-plugin command "memory-dashboard" must point to a JavaScript entrypoint.');
    });
  });

  describe('resolvePluginCommandEntry', () => {
    it('resolves command entry paths inside the plugin package root', () => {
      const entry = resolvePluginCommandEntry(
        '/home/test/.ai-devkit/npm/node_modules/@ai-devkit/memory-dashboard',
        './dist/command.js'
      );

      expect(entry).toBe(path.resolve('/home/test/.ai-devkit/npm/node_modules/@ai-devkit/memory-dashboard/dist/command.js'));
    });

    it('rejects command entry paths outside the plugin package root', () => {
      expect(() => resolvePluginCommandEntry(
        '/home/test/.ai-devkit/npm/node_modules/@ai-devkit/memory-dashboard',
        '../other-plugin/dist/command.js'
      )).toThrow('Plugin command entry must resolve inside the plugin package root.');
    });
  });
});
