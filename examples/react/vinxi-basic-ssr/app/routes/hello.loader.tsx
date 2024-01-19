import { FileRouteLoader } from '@tanstack/react-router'

async function getData() {
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

export const loader = FileRouteLoader('/hello')(() => getData())
