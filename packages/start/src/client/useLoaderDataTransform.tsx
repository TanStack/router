import { replaceBy } from './serialization'

export function useLoaderDataTransform<T>(value: T): T {
  // let element: JSX.Element

  // return replaceBy(value, (value, path) => {
  //   if (typeof value === 'string' && value.startsWith('__TSR_')) {

  //   }
  // })

  // // If we're in a node environment, we can use the
  // // createFromNodeStream API to create the element
  // if (rscClient.createFromNodeStream) {
  //   const readable = (response as any).asyncReadable

  //   readable.getElement = () => element
  //   readable.status = 'pending'
  //   readable.promise = new Promise<void>((resolve, reject) => {
  //     let data = ''
  //     readable.on('error', (err: any) => {
  //       readable.status = 'error'
  //       reject(err)
  //     })
  //     readable.on('data', (chunk: any) => {
  //       data += chunk.toString()
  //     })
  //     readable.on('end', () => {
  //       readable.status = 'success'
  //       console.info('success', data)
  //       readable.data = data
  //       resolve()
  //     })
  //   })

  //   element = await rscClient.createFromNodeStream(readable)

  //   // Return the readable
  //   return readable
  // }

  // element = await rscClient.createFromFetch(response)
  // ;(response as any).getElement = () => element

  return value
}
