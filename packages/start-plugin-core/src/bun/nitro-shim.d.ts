declare module 'nitro/builder' {
  export interface Nitro {
    options: {
      output: {
        dir: string
        publicDir: string
        serverDir: string
      }
      [key: string]: unknown
    }
    close: () => Promise<void>
  }

  export function createNitro(
    config: Record<string, unknown>,
  ): Promise<Nitro>
  export function prepare(nitro: Nitro): Promise<void>
  export function copyPublicAssets(nitro: Nitro): Promise<void>
  export function build(nitro: Nitro): Promise<void>
}
