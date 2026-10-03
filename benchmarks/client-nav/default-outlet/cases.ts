export const outletCases = [
  { id: 'implicit-plain', mode: 'implicit', boundaries: false },
  { id: 'implicit-default-boundaries', mode: 'implicit', boundaries: true },
  { id: 'mixed-default-boundaries', mode: 'mixed', boundaries: true },
  { id: 'explicit-default-boundaries', mode: 'explicit', boundaries: true },
] as const

export type OutletCase = (typeof outletCases)[number]

export const depth = 8
export const deepPath = `/${Array.from({ length: depth }, (_, index) => `level-${index}`).join('/')}`
export const steps = ['leaf-first', 'leaf-second', 'empty', 'home'] as const

export function assertStepResult(index: number, container: HTMLElement) {
  const step = steps[index % steps.length]!
  const leaf = container.querySelector('[data-testid="leaf-state"]')
  const home = container.querySelector('[data-testid="home-state"]')
  const expected = step === 'leaf-first' ? 'first' : 'second'
  if (step.startsWith('leaf-')) {
    if (leaf?.textContent !== expected || home) {
      throw new Error(
        `Expected leaf ${expected}, received ${leaf?.textContent}`,
      )
    }
  } else if (step === 'home') {
    if (home?.textContent !== 'Home' || leaf) {
      throw new Error('Expected home without a leaf')
    }
  } else if (leaf || home) {
    throw new Error('A componentless terminal route must render no content')
  }
  if (container.querySelector('[data-testid="unexpected-fallback"]')) {
    throw new Error('Success navigation unexpectedly rendered a fallback')
  }
}
