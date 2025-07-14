import portHandlerServer from './portHandlerServer'
import { serverIsRunning } from './getPort'

const isRunning = await serverIsRunning()

if (!isRunning) {
  await portHandlerServer()
} else {
  console.log('Port handler server already running!')
}
