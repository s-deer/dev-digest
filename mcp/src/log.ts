/**
 * The only I/O this package does outside HTTP: JSON lines to stderr. Never
 * stdout — stdout is the MCP protocol channel. Never logs response bodies.
 */

type LogLevel = 'info' | 'warn' | 'error';

function write(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  const line = JSON.stringify({ time: new Date().toISOString(), level, message, ...meta });
  process.stderr.write(line + '\n');
}

export const log = {
  info: (message: string, meta?: Record<string, unknown>) => write('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => write('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => write('error', message, meta),
};
