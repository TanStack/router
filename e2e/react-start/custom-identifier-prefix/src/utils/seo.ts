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
    { name: 'twitter:title', content: title },
    { name: 'twitter:creator', content: '@tannerlinsley' },
    { name: 'twitter:site', content: '@tannerlinsley' },
    { name: 'og:type', content: 'website' },
    { name: 'og:title', content: title },
    ...(description
      ? [
          { name: 'description', content: description },
          { name: 'twitter:description', content: description },
          { name: 'og:description', content: description },
        ]
      : []),
    ...(keywords ? [{ name: 'keywords', content: keywords }] : []),
    ...(image
      ? [
          { name: 'twitter:image', content: image },
          { name: 'twitter:card', content: 'summary_large_image' },
          { name: 'og:image', content: image },
        ]
      : []),
  ]

  return tags
}
