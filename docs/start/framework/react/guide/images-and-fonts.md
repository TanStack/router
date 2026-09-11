---
id: images-and-fonts
title: Images and Fonts
description: Build responsive images and self-hosted fonts in TanStack Start, with a tested example, image-service configuration, loading priority, and remote-image limits.
---

TanStack Start renders standard image elements and CSS font declarations. It does not include the `next/image` transformation server or `next/font` build API. Choose where image files are resized and where font files are served, then verify the production output.

The [runnable image and font example](https://github.com/TanStack/router/tree/main/examples/react/start-images-fonts) uses build-time image resizing and a self-hosted variable font. It runs locally without service credentials and tests responsive selection, reserved image space, fallback text, and font requests.

## Choose where images are transformed

| Source                                 | Transformation                                          | Delivery                                |
| -------------------------------------- | ------------------------------------------------------- | --------------------------------------- |
| A small set of checked-in assets       | Generate sizes during the build                         | Your application's static assets        |
| A CMS or changing public image library | An image service generates sizes                        | Its CDN or your configured image domain |
| Private uploads                        | A service with authorization and a defined cache policy | Authorized delivery URLs                |

An image component controls markup such as `srcset`, `sizes`, dimensions, and loading. An image service fetches, resizes, encodes, and caches the bytes. A component such as [Unpic](https://unpic.pics/img/react/) can generate URLs for supported services, but installing it does not turn an arbitrary origin into a transformation server. Start's [CDN Asset URLs](./cdn-asset-urls) feature rewrites asset locations; it does not resize images either.

## Generate local image sizes

The example uses [Sharp](https://sharp.pixelplumbing.com/api-resize/) as a development dependency. Its build script creates 480, 960, and 1600 pixel WebP versions before Vite starts. Sharp stays out of the browser and request handler. The build environment must support its native binaries.

```js
import sharp from 'sharp'

for (const width of [480, 960, 1600]) {
  await sharp('artwork/coast.svg')
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(`src/assets/coast-${width}.webp`)
}
```

Create the output directory first, as the example's script does. Keep source assets outside `public` when visitors do not need the originals. The example sets Vite's `build.assetsInlineLimit` to `0` so small candidates remain separate files instead of data URLs embedded in the markup. Import generated files so Vite can fingerprint them:

```tsx
import small from '../assets/coast-480.webp'
import medium from '../assets/coast-960.webp'
import large from '../assets/coast-1600.webp'
;<img
  src={medium}
  srcSet={`${small} 480w, ${medium} 960w, ${large} 1600w`}
  sizes="(min-width: 992px) 960px, calc(100vw - 32px)"
  width={1600}
  height={900}
  loading="eager"
  fetchPriority="high"
  alt="A lighthouse above layered blue cliffs and a quiet bay"
/>
```

This markup matches a container capped at 960 CSS pixels with 16 pixels of space on either side of smaller screens:

```css
main {
  width: min(960px, calc(100% - 32px));
  margin-inline: auto;
}
img {
  display: block;
  width: 100%;
  height: auto;
}
```

Change `sizes` when the actual layout changes. It describes the rendered width, not the original file width. A wrong value can make a small card download a large hero image. The width descriptors must match the files' actual pixel widths, including when a smaller original prevents enlargement. The example's source is 1600 pixels wide, so all three descriptors are accurate.

The `width` and `height` attributes reserve the aspect ratio before bytes arrive. Keep that ratio consistent across candidates. Use `<picture>` when mobile needs a different crop or you want format-specific sources, and provide an `<img>` fallback. Meaningful images need useful alt text; decorative images should use `alt=""`.

Do not lazy-load the main above-the-fold image. Give high fetch priority only to an image likely to be the page's largest visible content. For offscreen images, use `loading="lazy"` and ordinary priority. Avoid adding a second preload unless a network trace shows late discovery; an incorrect preload can fetch an unused candidate. See the [HTML image reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/img).

## Configure an image service

For images that change after a deployment, use a transformation service instead of rebuilding every variant. For example, Cloudflare's URL interface uses a configured zone, transformation options, and a source path:

```text
https://images.example.com/cdn-cgi/image/width=960,quality=80,format=auto/photos/coast.jpg
```

This is a configuration example, not a working public endpoint. Enable transformations for your zone, configure allowed source origins, and make the original reachable to that service. The `/cdn-cgi/image/` prefix alone does not enable processing on a plain local server or another host. Follow the provider's [URL configuration](https://developers.cloudflare.com/images/optimization/features/) and [source-origin controls](https://developers.cloudflare.com/images/optimization/transformations/sources/) for your deployment.

Generate a finite set of widths for `srcSet`, using the same dimensions and `sizes` rules as the local example. If you use Unpic, select a supported provider and pass that provider's source URL and layout configuration. Inspect the URLs it emits and fetch them directly. Check the returned image dimensions and content type; successful HTML rendering does not prove that resizing happened.

Before exposing remote transformations:

- Restrict source hosts and paths at the service or server boundary. A browser-side allowlist does not protect a publicly callable endpoint. Check redirect behavior too: Cloudflare documents that its source-origin check applies to the initial URL, while redirects are followed.
- Bound dimensions, decoded pixels, input bytes, processing time, output formats, and animation frames. Avoid unbounded transformations controlled by arbitrary query strings.
- Enforce authorization before serving private originals or derived images. Do not put private images into a shared public cache or expose signing secrets in client code.
- Define cache keys, expiry, and invalidation for changed originals. Include transformation parameters in the cache identity. Use versioned source URLs when replacing content.
- Verify unsupported formats, missing sources, timeouts, and rejected origins. Review the service's limits and costs before expanding the allowed variants.

The local example has no remote fetch endpoint. It therefore does not demonstrate a secure general-purpose image proxy or validate a provider account's settings.

## Self-host a font

Install a licensed font package such as [Fontsource Inter](https://fontsource.org/fonts/inter/install), or keep licensed WOFF2 files in your source tree. The example pins `@fontsource-variable/inter` and references only its normal Latin variable file:

```css
@font-face {
  font-family: 'Inter';
  src: url('@fontsource-variable/inter/files/inter-latin-wght-normal.woff2')
    format('woff2');
  font-style: normal;
  font-weight: 100 900;
  font-display: optional;
}
body {
  font-family: 'Inter', system-ui, sans-serif;
}
```

One variable file covers the weights used by this page. Import only the subsets and styles your content needs. A Latin-only face does not cover every language, and normal text does not provide a true italic face. Preserve the font's license when redistributing files.

`font-display: optional` allows a slow visit to retain the fallback font instead of swapping later. Use `swap` when displaying the chosen typeface after download matters more, and measure the resulting layout shift. `swap` alone does not make fallback metrics match. If you add `size-adjust`, ascent, descent, or line-gap overrides, derive them from the actual font pair and test wrapping at your supported sizes. See [font-display](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@font-face/font-display).

For a critical font used immediately, preload the same URL that CSS requests. In the root route:

```tsx
import fontUrl from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url'
import cssUrl from '../styles.css?url'

head: () => ({
  links: [
    { rel: 'stylesheet', href: cssUrl },
    {
      rel: 'preload',
      href: fontUrl,
      as: 'font',
      type: 'font/woff2',
      crossOrigin: 'anonymous',
    },
  ],
})
```

Render `<HeadContent />` in the document head, as shown in the example. Preloading every weight or a font used only on another route competes with more useful requests. Keep the preload's URL and cross-origin mode aligned with the font request to avoid duplicate downloads. Fonts served from a separate origin also need that server's CORS configuration.

## Verify the production build

Run the example's browser tests in both development and production modes. Then repeat the checks on your deployed hostname:

1. Inspect initial HTML for image sources, dimensions, `sizes`, and the intended font preload.
2. Use fresh browser contexts for narrow and wide viewports at different device pixel ratios. Inspect `currentSrc` and the downloaded file's actual dimensions. A browser can reuse a larger cached candidate, so shrinking an already-loaded tab is not a clean selection test.
3. Block image and font requests. The image should retain its space and the text should remain usable. Check layout shift separately under throttling.
4. Inspect the network waterfall for duplicate fonts, unexpected third-party requests, oversized images, and failures. Confirm content types and cache headers on the final host.
5. Check your real photographs and content. The example's small illustration verifies the pipeline, not a universal image-quality setting or a field performance score.

For migrating application behavior beyond these assets, see [Migrate from Next.js](../migrate-from-next-js). For deployment checks, use the [Production Checklist](./production-checklist).
