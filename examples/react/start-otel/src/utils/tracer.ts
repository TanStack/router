import { trace } from '@opentelemetry/api'

export const tracer = trace.getTracer('tanstack-start')
