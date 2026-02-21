export type LogLevel = 'info' | 'success' | 'error' | 'warn'

export interface LogEntry {
  level: LogLevel
  step: string
  message: string
  data?: unknown
}

const CONSOLE_STYLES: Record<LogLevel, string> = {
  info:    'color:#818cf8;font-weight:bold',
  success: 'color:#22c55e;font-weight:bold',
  error:   'color:#f87171;font-weight:bold',
  warn:    'color:#fbbf24;font-weight:bold',
}

export function log(entry: LogEntry): void {
  // ── Browser console ──────────────────────────────────────────────────────
  const prefix = `[${entry.step.toUpperCase()}]`
  if (entry.data !== undefined) {
    console.log(`%c${prefix} ${entry.message}`, CONSOLE_STYLES[entry.level], entry.data)
  } else {
    console.log(`%c${prefix} ${entry.message}`, CONSOLE_STYLES[entry.level])
  }

  // ── Terminal (Vite dev server) ────────────────────────────────────────────
  fetch('/api/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  }).catch(() => { /* server may not be running in production */ })
}
