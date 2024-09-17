import { EventEmitter } from 'node:events'
import * as fs from 'node:fs'
import { json } from '@tanstack/start'
import { createAPIFileRoute } from '@tanstack/start/api'
import { getEvent, sendStream, setHeaders } from 'vinxi/http'

const eventManager = new EventEmitter()
const filePath = 'count.txt'
const dataToSSEvent = (eventName: string, data: unknown) => {
  /*
  format for an event stream
  event: message
  data: {"value":1}
  */
  return `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`
}

const readCount = async () => {
  return parseInt(
    await fs.promises.readFile(filePath, 'utf-8').catch(() => '0'),
  )
}

const incrementCount = async () => {
  const count = await readCount()
  const sum = count + 1
  await fs.promises.writeFile(filePath, `${sum}`)
  return sum
}

export const Route = createAPIFileRoute('/api/ping')({
  GET: () => {
    setHeaders({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    })

    let listener: null | (() => void) = null
    const event = getEvent()
    const cleanUp = () => {
      if (listener) {
        console.info('Client disconnected')
        eventManager.off('ping', listener)
        listener = null
      }
    }

    event.node.req.on('close', cleanUp)
    event.node.req.on('end', cleanUp)
    event.node.req.on('error', cleanUp)

    return sendStream(
      event,
      new ReadableStream({
        async start(controller) {
          const initialValue = await readCount()
          controller.enqueue(dataToSSEvent('message', { value: initialValue }))
          listener = async () => {
            const currentValue = await readCount()
            console.info('Sent value to client', currentValue)
            controller.enqueue(
              dataToSSEvent('message', { value: currentValue }),
            )
          }

          eventManager.on('ping', listener)
        },
        cancel() {
          if (listener) {
            cleanUp()
          }
        },
      }),
    ) as any
  },
  PUT: async () => {
    const newValue = await incrementCount()
    eventManager.emit('ping')
    console.info('Client incremented value', newValue)
    return json(
      {
        message: 'ok',
        data: newValue,
      },
      {
        status: 200,
      },
    )
  },
})
