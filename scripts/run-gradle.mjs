import { spawn } from 'node:child_process';
import { platform } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const isWindows = platform() === 'win32';
const command = isWindows ? 'cmd.exe' : './gradlew';
const commandArgs = isWindows ? ['/d', '/s', '/c', 'gradlew.bat', ...args] : args;
const child = spawn(command, commandArgs, {
  cwd: join(process.cwd(), 'android'),
  stdio: 'inherit',
  shell: false,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  }
  process.exit(code ?? 1);
});
