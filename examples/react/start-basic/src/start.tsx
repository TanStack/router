import { createStart, RegisteredStartConfig, Register, RegisteredRequestContext } from "@tanstack/react-start"
import { useRouter } from "@tanstack/react-router"
import { createRouter } from "./router"

export const start = createStart( () => {
    const router = createRouter()
    return {router}
})



declare module '@tanstack/react-start' {
    interface Register {
        start: typeof start
        server: {
            requestContext: {
                test: string
            }
        }
    }
  }

  


type X = RegisteredStartConfig['~types']['router']['routesById']['/posts/$postId']
//   ^?

const router = useRouter()
router.navigate({to: '/posts/$postId', params: {postId: '123'}})


type R = RegisteredRequestContext
//   ^?