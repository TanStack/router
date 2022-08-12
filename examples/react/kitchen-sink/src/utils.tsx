export async function loaderDelayFn<T>(fn: (...args: any[]) => Promise<T> | T) {
  const delay = Number(sessionStorage.getItem('loaderDelay') ?? 0)
  const delayPromise = new Promise((r) => setTimeout(r, delay))

  const [res] = await Promise.all([fn(), delayPromise])

  return res
}

export async function actionDelayFn<T>(fn: (...args: any[]) => Promise<T> | T) {
  const delay = Number(sessionStorage.getItem('actionDelay') ?? 0)
  const delayPromise = new Promise((r) => setTimeout(r, delay))

  const [res] = await Promise.all([fn(), delayPromise])

  return res
}

export function shuffle<T>(arr: T[]): T[] {
  var i = arr.length
  if (i == 0) return arr
  const copy = [...arr]
  while (--i) {
    var j = Math.floor(Math.random() * (i + 1))
    var a = copy[i]
    var b = copy[j]
    copy[i] = b!
    copy[j] = a!
  }
  return copy
}
