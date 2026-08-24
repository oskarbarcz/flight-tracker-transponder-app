import { execFile } from 'node:child_process';

export type CommandResult = {
  stdout: string;
  status: 'ok' | 'failed';
};

export type CommandRunner = (
  file: string,
  args: string[],
) => Promise<CommandResult>;

export const runCommand: CommandRunner = (file, args) =>
  new Promise((resolve) => {
    execFile(file, args, { windowsHide: true }, (error, stdout) => {
      resolve({
        stdout: stdout.toString().trim(),
        status: error === null ? 'ok' : 'failed',
      });
    });
  });
