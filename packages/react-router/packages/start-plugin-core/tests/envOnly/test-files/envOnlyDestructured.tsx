import { serverOnly, clientOnly } from '@tanstack/react-start'

const serverFunc = serverOnly(() => 'server')

const clientFunc = clientOnly(() => 'client')
