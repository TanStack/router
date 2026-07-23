export interface TransformRouteSourceOptions {
  source: string
  filename: string
  node: unknown
}

export interface FormatRouteOptions {
  source: string
  node: unknown
}

export interface OctaneRouteGeneratorPlugin {
  name: string
  transformRouteSource: (options: TransformRouteSourceOptions) => string
  formatRoute: (options: FormatRouteOptions) => string
}

export declare function maskOctaneRouteSource(
  source: string,
  filename?: string,
): string

export declare function octaneRouteGeneratorPlugin(): OctaneRouteGeneratorPlugin
