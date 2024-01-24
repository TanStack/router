import { createFileRoute } from '@tanstack/react-router'

function getServerData() {
  'use server'

  return new Promise<string>((r) => {
    setTimeout(
      () =>
        r(
          `Hello from the server! Your OS is ${process.platform} and your architecture is ${process.arch}`,
        ),
      1000,
    )
  })
}

export const Route = createFileRoute('/hello')({
  loader: () => getServerData(),
})
