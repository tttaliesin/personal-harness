import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { edgeArguments } from './runtime.mjs';

// Process-local launch correction only. No checker source or results are changed.
if (process.platform === 'win32' && process.env.PERSONAL_HARNESS_TASTE_RUNTIME === '1') {
  const originalSpawn = childProcess.spawn;
  childProcess.spawn = function(command, args, options) {
    return originalSpawn.call(this, command, edgeArguments(command, args, process.env.CHROME_PATH), options);
  };
  syncBuiltinESMExports();

  // Windows kill(SIGINT/SIGTERM) terminates a process instead of running its handlers.
  // A private IPC channel lets the original script perform its own browser cleanup.
  if (process.channel && process.env.PERSONAL_HARNESS_TASTE_IPC_TOKEN) {
    process.on('message', message => {
      if (message?.type !== 'personal-harness-taste-signal' || message.token !== process.env.PERSONAL_HARNESS_TASTE_IPC_TOKEN || !['SIGINT', 'SIGTERM'].includes(message.signal)) return;
      if (process.listenerCount(message.signal)) process.emit(message.signal, message.signal);
      else process.exit(message.signal === 'SIGINT' ? 130 : 143);
    });
    process.channel.unref();
  }
}
