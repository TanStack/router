export const LINK_COUNT = 20
export const HOOK_COUNT = 20
export const TARGET_ID = 100

export function heavySelect(
  seed: string | number | undefined,
  salt: number,
): number {
  let value =
    typeof seed === 'number' ? seed : Number.parseInt(seed ?? '0', 10) || 0

  for (let i = 0; i < 80; i++) {
    value = (value * 33 + salt + i) % 104_729
    value ^= (value << 5) & 0xffff
    value &= 0x7fffffff
  }

  return value
}

export function parseIntOrZero(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }

  const parsed = Number.parseInt(String(value ?? '0'), 10)
  return Number.isFinite(parsed) ? parsed : 0
}
