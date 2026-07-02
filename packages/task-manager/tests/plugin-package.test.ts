import packageJson from '../package.json' with { type: 'json' };

describe('task manager plugin package', () => {
  it('declares the task command in the ai-devkit plugin manifest', () => {
    expect(packageJson.aiDevkit).toEqual({
      commands: [
        {
          name: 'task',
          description: 'Manage durable development/debug tasks',
          entry: './dist/command.js',
        },
      ],
    });
  });
});
