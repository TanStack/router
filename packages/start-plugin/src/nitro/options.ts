import { PrerenderRoute } from 'nitropack';

export interface Options {
  ssr?: boolean;
  ssrBuildDir?: string;
  /**
   * Prerender the static pages without producing the server output.
   */
  static?: boolean;
  prerender?: PrerenderOptions;
  entryServer?: string;
  index?: string;
  workspaceRoot?: string;
  /**
   * Additional page paths to include
   */
  additionalPagesDirs?: string[];
  /**
   * Additional API paths to include
   */
  additionalAPIDirs?: string[];
  apiPrefix?: string;

  /**
   * Toggles internal API middleware.
   * If disabled, a proxy request is used to route /api
   * requests to / in the production server build.
   */
  useAPIMiddleware?: boolean;
}

export interface PrerenderOptions {
  /**
   * Add additional routes to prerender through crawling page links.
   */
  discover?: boolean;

  /**
   * List of routes to prerender resolved statically or dynamically.
   */
  routes?:
    | (string | PrerenderContentDir)[]
    | (() => Promise<(string | PrerenderContentDir | undefined)[]>);
  sitemap?: SitemapConfig;
  /** List of functions that run for each route after pre-rendering is complete. */
  postRenderingHooks?: ((routes: PrerenderRoute) => Promise<void>)[];
}

export interface SitemapConfig {
  host: string;
}

export interface PrerenderContentDir {
  /**
   * The directory where files should be grabbed from.
   * @example `/src/contents/blog`
   */
  contentDir: string;
  /**
   * Transform the matching content files path into a route.
   * The function is called for each matching content file within the specified contentDir.
   * @param file information of the matching file (`path`, `name`, `extension`, `attributes`)
   * @returns a string with the route should be returned (e. g. `/blog/<slug>`) or the value `false`, when the route should not be prerendered.
   */
  transform: (file: PrerenderContentFile) => string | false;
}

/**
 * @param path the path to the content file
 * @param name the basename of the matching content file without the file extension
 * @param extension the file extension
 * @param attributes the frontmatter attributes extracted from the frontmatter section of the file
 * @returns a string with the route should be returned (e. g. `/blog/<slug>`) or the value `false`, when the route should not be prerendered.
 */
export interface PrerenderContentFile {
  path: string;
  attributes: Record<string, any>;
  name: string;
  extension: string;
}
