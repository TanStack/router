export const seo = ({
  title,
  description,
  keywords,
  image,
}: {
  title: string
  description?: string
  image?: string
  keywords?: string
}) => {
  const tags = [
    { title },
    ...(description ? [{ name: 'description', content: description }] : []),
    ...(keywords ? [{ name: 'keywords', content: keywords }] : []),
    { name: 'twitter:title', content: title },
    ...(description
      ? [{ name: 'twitter:description', content: description }]
      : []),
    { name: 'twitter:creator', content: '@tannerlinsley' },
    { name: 'twitter:site', content: '@tannerlinsley' },
    { property: 'og:type', content: 'website' },
    { property: 'og:title', content: title },
    ...(description
      ? [{ property: 'og:description', content: description }]
      : []),
    ...(image
      ? [
          { name: 'twitter:image', content: image },
          { name: 'twitter:card', content: 'summary_large_image' },
          { property: 'og:image', content: image },
        ]
      : []),
  ]

  return tags
}
