import * as cheerio from 'cheerio'

export function extractHtmlScripts(
  html: string,
): Array<{ content?: string; src?: string }> {
  const $ = cheerio.load(html)
  const scripts: Array<{ content?: string; src?: string }> = []

  $('script').each((_, element) => {
    const src = $(element).attr('src')
    const content = $(element).html() ?? undefined
    scripts.push({
      src,
      content,
    })
  })

  return scripts
}
