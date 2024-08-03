const blogPosts: Array<{
  category: string
  content: string
  expiration_time?: Date
  id: string
  last_updated: Date
  published_time: Date
  subtitle: string
  tags: Array<string>
  title: string
}> = [
  {
    category: 'Promotional',
    content:
      'Lorem ipsum odor amet, consectetuer adipiscing elit. Pretium scelerisque a turpis ac; ultrices inceptos. Congue efficitur ante sed magnis condimentum egestas. Cubilia ex rhoncus gravida diam consectetur. Nunc habitant egestas efficitur, faucibus tellus iaculis pharetra netus. Viverra placerat tincidunt sapien volutpat et. Justo congue vestibulum elementum litora ridiculus imperdiet.',
    expiration_time: new Date('January 1, 2025'),
    id: 'a1',
    last_updated: new Date('August 1, 2024'),
    published_time: new Date('July 1, 2024'),
    subtitle: 'wow so value',
    tags: ['deal', 'bargain'],
    title: 'Great offer!',
  },
  {
    category: 'Educational',
    content:
      'Lorem ipsum odor amet, consectetuer adipiscing elit. Est morbi habitant vitae torquent est nullam. Ultricies vel pharetra egestas elementum; platea ex ac. Est parturient natoque leo adipiscing pretium lacus in diam placerat. Fermentum lorem mollis eros curae inceptos tincidunt fusce. Libero nunc augue lectus orci sem auctor ante. Lobortis adipiscing faucibus luctus laoreet amet dignissim. Placerat sollicitudin accumsan consequat proin, bibendum senectus finibus metus. Senectus nulla consequat elit mollis tristique amet sagittis in.',
    id: 'b2',
    last_updated: new Date('June 1, 2024'),
    published_time: new Date('June 1, 2024'),
    subtitle: 'wow much interesting',
    tags: ['science', 'learning'],
    title: 'Learn science!',
  },
]

export default blogPosts
