export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function createTimer() {
  let time = Date.now()

  return {
    start: () => {
      time = Date.now()
    },
    getTime: () => {
      return Date.now() - time
    },
  }
}
