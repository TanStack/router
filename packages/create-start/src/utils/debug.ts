import { InvalidArgumentError, createOption } from '@commander-js/extra-typings'

type Context = string
type LogLevel = 'info' | 'warn' | 'error'

interface LogOptions {
  context: Context
  data?: Record<string, unknown>
}

let isDebugMode = false
let debugLevel = 0 // 1 = basic, 2 = verbose, 3 = trace

const DEBUG_LEVELS = ['debug', 'trace', 'verbose'] as const
type DebugLevels = (typeof DEBUG_LEVELS)[number]

export const debugCliOption = createOption(
  `--debug <${DEBUG_LEVELS.join('|')}>`,
  `Set a debug level (${DEBUG_LEVELS.join(', ')})`,
).argParser((value) => {
  if (!DEBUG_LEVELS.includes(value as DebugLevels)) {
    throw new InvalidArgumentError(
      `Invalid debug level: ${value}. Only the following are allowed: ${DEBUG_LEVELS.join(', ')}`,
    )
  }
  return value as DebugLevels
})

export const initDebug = (level: undefined | 'debug' | 'trace' | 'verbose') => {
  if (level === undefined) return
  isDebugMode = true
  if (level === 'debug') debugLevel = 1
  if (level === 'trace') debugLevel = 2
  if (level === 'verbose') debugLevel = 3
}

const formatData = (data?: Record<string, unknown>): string => {
  if (!data) return ''
  return Object.entries(data)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join(' ')
}

const log = (level: LogLevel, message: string, options: LogOptions) => {
  if (!isDebugMode) return

  const timestamp = new Date().toISOString()
  const dataStr = formatData(options.data)
  const logMessage = `[${timestamp}] [${level}] [${options.context}] ${message} ${dataStr}`

  switch (level) {
    case 'error':
      console.error(logMessage)
      break
    case 'warn':
      console.warn(logMessage)
      break
    case 'info':
      console.log(logMessage)
      break
  }
}

export const createDebugger = (context: Context) => ({
  info: (message: string, data?: Record<string, unknown>) => {
    if (debugLevel < 1) return
    log('info', message, { context, data })
  },
  warn: (message: string, data?: Record<string, unknown>) => {
    if (debugLevel < 2) return
    log('warn', message, { context, data })
  },
  error: (
    message: string,
    error?: Error | unknown,
    data?: Record<string, unknown>,
  ) => {
    if (debugLevel < 1) return
    log('error', message, {
      context,
      data: {
        ...data,
        error: error instanceof Error ? error.message : error,
      },
    })
  },
  verbose: (message: string, data?: Record<string, unknown>) => {
    if (debugLevel < 2) return
    log('info', message, { context, data })
  },
  trace: (message: string, data?: Record<string, unknown>) => {
    if (debugLevel < 3) return
    log('info', message, { context, data })
  },
})
