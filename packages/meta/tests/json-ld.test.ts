import { describe, expect, it } from 'vitest'
import { jsonLd } from '../src/json-ld/builders'

describe('JSON-LD Builders', () => {
  describe('jsonLd.create', () => {
    it('should create a JSON-LD descriptor with single schema', () => {
      const result = jsonLd.create({
        '@type': 'WebSite',
        name: 'My Site',
        url: 'https://example.com',
      })
      expect(result).toEqual([
        {
          'script:ld+json': {
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: 'My Site',
            url: 'https://example.com',
          },
        },
      ])
    })

    it('should create a JSON-LD descriptor with @graph for multiple schemas', () => {
      const result = jsonLd.create([
        { '@type': 'WebSite', name: 'My Site' },
        { '@type': 'Organization', name: 'My Org' },
      ])
      expect(result).toEqual([
        {
          'script:ld+json': {
            '@context': 'https://schema.org',
            '@graph': [
              { '@type': 'WebSite', name: 'My Site' },
              { '@type': 'Organization', name: 'My Org' },
            ],
          },
        },
      ])
    })
  })

  describe('jsonLd.website', () => {
    it('should create a WebSite schema', () => {
      const result = jsonLd.website({
        name: 'My Site',
        url: 'https://example.com',
      })
      const schema = (result[0] as any)['script:ld+json']
      expect(schema['@context']).toBe('https://schema.org')
      expect(schema['@type']).toBe('WebSite')
      expect(schema.name).toBe('My Site')
      expect(schema.url).toBe('https://example.com')
    })

    it('should include search action when searchUrl provided', () => {
      const result = jsonLd.website({
        name: 'My Site',
        searchUrl: 'https://example.com/search?q={query}',
      })
      const schema = (result[0] as any)['script:ld+json']
      expect(schema.potentialAction).toBeDefined()
      expect(schema.potentialAction['@type']).toBe('SearchAction')
    })
  })

  describe('jsonLd.organization', () => {
    it('should create an Organization schema', () => {
      const result = jsonLd.organization({
        name: 'My Company',
        url: 'https://example.com',
        logo: 'https://example.com/logo.png',
        socials: [
          'https://twitter.com/mycompany',
          'https://linkedin.com/company/mycompany',
        ],
      })
      const schema = (result[0] as any)['script:ld+json']
      expect(schema['@type']).toBe('Organization')
      expect(schema.name).toBe('My Company')
      expect(schema.logo).toBe('https://example.com/logo.png')
      expect(schema.sameAs).toEqual([
        'https://twitter.com/mycompany',
        'https://linkedin.com/company/mycompany',
      ])
    })

    it('should include address when provided', () => {
      const result = jsonLd.organization({
        name: 'My Company',
        address: {
          street: '123 Main St',
          city: 'City',
          region: 'State',
          postal: '12345',
          country: 'US',
        },
      })
      const schema = (result[0] as any)['script:ld+json']
      expect(schema.address['@type']).toBe('PostalAddress')
      expect(schema.address.streetAddress).toBe('123 Main St')
    })
  })

  describe('jsonLd.person', () => {
    it('should create a Person schema', () => {
      const result = jsonLd.person({
        name: 'John Doe',
        url: 'https://johndoe.com',
        jobTitle: 'Software Engineer',
      })
      const schema = (result[0] as any)['script:ld+json']
      expect(schema['@type']).toBe('Person')
      expect(schema.name).toBe('John Doe')
      expect(schema.jobTitle).toBe('Software Engineer')
    })
  })

  describe('jsonLd.article', () => {
    it('should create an Article schema', () => {
      const result = jsonLd.article({
        headline: 'Article Title',
        description: 'Article description',
        author: 'John Doe',
        datePublished: '2024-01-15',
      })
      const schema = (result[0] as any)['script:ld+json']
      expect(schema['@type']).toBe('Article')
      expect(schema.headline).toBe('Article Title')
      expect(schema.author['@type']).toBe('Person')
      expect(schema.author.name).toBe('John Doe')
    })

    it('should handle author object', () => {
      const result = jsonLd.article({
        headline: 'Article Title',
        author: { name: 'John Doe', url: 'https://johndoe.com' },
      })
      const schema = (result[0] as any)['script:ld+json']
      expect(schema.author.name).toBe('John Doe')
      expect(schema.author.url).toBe('https://johndoe.com')
    })

    it('should allow custom article type', () => {
      const result = jsonLd.article({
        headline: 'Blog Post',
        type: 'BlogPosting',
      })
      const schema = (result[0] as any)['script:ld+json']
      expect(schema['@type']).toBe('BlogPosting')
    })
  })

  describe('jsonLd.product', () => {
    it('should create a Product schema', () => {
      const result = jsonLd.product({
        name: 'Cool Product',
        description: 'A very cool product',
        price: 99.99,
        currency: 'USD',
        availability: 'InStock',
        brand: 'My Brand',
      })
      const schema = (result[0] as any)['script:ld+json']
      expect(schema['@type']).toBe('Product')
      expect(schema.name).toBe('Cool Product')
      expect(schema.brand['@type']).toBe('Brand')
      expect(schema.brand.name).toBe('My Brand')
      expect(schema.offers.price).toBe(99.99)
      expect(schema.offers.availability).toBe('https://schema.org/InStock')
    })

    it('should include rating when provided', () => {
      const result = jsonLd.product({
        name: 'Product',
        rating: { value: 4.5, count: 100 },
      })
      const schema = (result[0] as any)['script:ld+json']
      expect(schema.aggregateRating['@type']).toBe('AggregateRating')
      expect(schema.aggregateRating.ratingValue).toBe(4.5)
      expect(schema.aggregateRating.ratingCount).toBe(100)
    })
  })

  describe('jsonLd.breadcrumbs', () => {
    it('should create a BreadcrumbList schema', () => {
      const result = jsonLd.breadcrumbs([
        { name: 'Home', url: 'https://example.com' },
        { name: 'Category', url: 'https://example.com/category' },
        { name: 'Product', url: 'https://example.com/category/product' },
      ])
      const schema = (result[0] as any)['script:ld+json']
      expect(schema['@type']).toBe('BreadcrumbList')
      expect(schema.itemListElement).toHaveLength(3)
      expect(schema.itemListElement[0].position).toBe(1)
      expect(schema.itemListElement[0].name).toBe('Home')
      expect(schema.itemListElement[2].position).toBe(3)
    })
  })

  describe('jsonLd.faq', () => {
    it('should create a FAQPage schema', () => {
      const result = jsonLd.faq([
        { question: 'What is X?', answer: 'X is...' },
        { question: 'How do I Y?', answer: 'You can Y by...' },
      ])
      const schema = (result[0] as any)['script:ld+json']
      expect(schema['@type']).toBe('FAQPage')
      expect(schema.mainEntity).toHaveLength(2)
      expect(schema.mainEntity[0]['@type']).toBe('Question')
      expect(schema.mainEntity[0].name).toBe('What is X?')
      expect(schema.mainEntity[0].acceptedAnswer['@type']).toBe('Answer')
      expect(schema.mainEntity[0].acceptedAnswer.text).toBe('X is...')
    })
  })

  describe('jsonLd.event', () => {
    it('should create an Event schema', () => {
      const result = jsonLd.event({
        name: 'Concert',
        startDate: '2024-06-15T19:00:00-07:00',
        location: 'Madison Square Garden',
      })
      const schema = (result[0] as any)['script:ld+json']
      expect(schema['@type']).toBe('Event')
      expect(schema.name).toBe('Concert')
      expect(schema.location).toBe('Madison Square Garden')
    })

    it('should handle location object', () => {
      const result = jsonLd.event({
        name: 'Concert',
        location: { name: 'Madison Square Garden', address: 'NYC' },
      })
      const schema = (result[0] as any)['script:ld+json']
      expect(schema.location['@type']).toBe('Place')
      expect(schema.location.name).toBe('Madison Square Garden')
    })

    it('should handle virtual location', () => {
      const result = jsonLd.event({
        name: 'Webinar',
        location: { name: 'Online', url: 'https://example.com/webinar' },
      })
      const schema = (result[0] as any)['script:ld+json']
      expect(schema.location['@type']).toBe('VirtualLocation')
    })

    it('should allow custom event type', () => {
      const result = jsonLd.event({
        name: 'Concert',
        type: 'MusicEvent',
      })
      const schema = (result[0] as any)['script:ld+json']
      expect(schema['@type']).toBe('MusicEvent')
    })
  })

  describe('jsonLd.localBusiness', () => {
    it('should create a LocalBusiness schema', () => {
      const result = jsonLd.localBusiness({
        name: 'My Restaurant',
        type: 'Restaurant',
        telephone: '+1-555-555-5555',
        priceRange: '$$',
      })
      const schema = (result[0] as any)['script:ld+json']
      expect(schema['@type']).toBe('Restaurant')
      expect(schema.telephone).toBe('+1-555-555-5555')
      expect(schema.priceRange).toBe('$$')
    })

    it('should handle string address', () => {
      const result = jsonLd.localBusiness({
        name: 'My Business',
        address: '123 Main St, City, State 12345',
      })
      const schema = (result[0] as any)['script:ld+json']
      expect(schema.address).toBe('123 Main St, City, State 12345')
    })

    it('should handle address object', () => {
      const result = jsonLd.localBusiness({
        name: 'My Business',
        address: { street: '123 Main St', city: 'City' },
      })
      const schema = (result[0] as any)['script:ld+json']
      expect(schema.address['@type']).toBe('PostalAddress')
    })
  })

  describe('jsonLd.softwareApp', () => {
    it('should create a SoftwareApplication schema', () => {
      const result = jsonLd.softwareApp({
        name: 'My App',
        type: 'MobileApplication',
        operatingSystem: 'iOS, Android',
        category: 'GameApplication',
        price: 0,
      })
      const schema = (result[0] as any)['script:ld+json']
      expect(schema['@type']).toBe('MobileApplication')
      expect(schema.applicationCategory).toBe('GameApplication')
      expect(schema.offers.price).toBe(0)
    })
  })

  describe('jsonLd.video', () => {
    it('should create a VideoObject schema', () => {
      const result = jsonLd.video({
        name: 'Video Title',
        description: 'Video description',
        thumbnail: 'https://example.com/thumb.jpg',
        uploadDate: '2024-01-15',
        duration: 'PT5M30S',
      })
      const schema = (result[0] as any)['script:ld+json']
      expect(schema['@type']).toBe('VideoObject')
      expect(schema.name).toBe('Video Title')
      expect(schema.thumbnailUrl).toBe('https://example.com/thumb.jpg')
      expect(schema.duration).toBe('PT5M30S')
    })
  })

  describe('jsonLd.recipe', () => {
    it('should create a Recipe schema', () => {
      const result = jsonLd.recipe({
        name: 'Chocolate Cake',
        description: 'Delicious cake',
        author: 'Chef John',
        prepTime: 'PT30M',
        cookTime: 'PT1H',
        servings: '8 servings',
        ingredients: ['2 cups flour', '1 cup sugar'],
      })
      const schema = (result[0] as any)['script:ld+json']
      expect(schema['@type']).toBe('Recipe')
      expect(schema.name).toBe('Chocolate Cake')
      expect(schema.author['@type']).toBe('Person')
      expect(schema.recipeIngredient).toHaveLength(2)
    })

    it('should handle string instructions', () => {
      const result = jsonLd.recipe({
        name: 'Simple Recipe',
        instructions: 'Mix and bake',
      })
      const schema = (result[0] as any)['script:ld+json']
      expect(schema.recipeInstructions).toBe('Mix and bake')
    })

    it('should handle array instructions', () => {
      const result = jsonLd.recipe({
        name: 'Simple Recipe',
        instructions: ['Mix ingredients', 'Bake for 30 minutes'],
      })
      const schema = (result[0] as any)['script:ld+json']
      expect(schema.recipeInstructions).toHaveLength(2)
      expect(schema.recipeInstructions[0]['@type']).toBe('HowToStep')
    })
  })

  describe('jsonLd.course', () => {
    it('should create a Course schema', () => {
      const result = jsonLd.course({
        name: 'Introduction to Programming',
        description: 'Learn the basics',
        provider: 'Online Academy',
      })
      const schema = (result[0] as any)['script:ld+json']
      expect(schema['@type']).toBe('Course')
      expect(schema.provider['@type']).toBe('Organization')
      expect(schema.provider.name).toBe('Online Academy')
    })
  })

  describe('jsonLd.howTo', () => {
    it('should create a HowTo schema with string steps', () => {
      const result = jsonLd.howTo({
        name: 'How to Make Coffee',
        steps: ['Boil water', 'Add coffee grounds', 'Pour water'],
      })
      const schema = (result[0] as any)['script:ld+json']
      expect(schema['@type']).toBe('HowTo')
      expect(schema.step).toHaveLength(3)
      expect(schema.step[0]['@type']).toBe('HowToStep')
      expect(schema.step[0].text).toBe('Boil water')
    })

    it('should handle object steps', () => {
      const result = jsonLd.howTo({
        name: 'How to Make Coffee',
        steps: [
          { name: 'Step 1', text: 'Boil water', image: 'https://example.com/step1.jpg' },
        ],
      })
      const schema = (result[0] as any)['script:ld+json']
      expect(schema.step[0].name).toBe('Step 1')
      expect(schema.step[0].image).toBe('https://example.com/step1.jpg')
    })
  })

  describe('jsonLd.webpage', () => {
    it('should create a WebPage schema', () => {
      const result = jsonLd.webpage({
        name: 'About Us',
        description: 'Learn about our company',
        url: 'https://example.com/about',
        inLanguage: 'en',
      })
      const schema = (result[0] as any)['script:ld+json']
      expect(schema['@type']).toBe('WebPage')
      expect(schema.name).toBe('About Us')
      expect(schema.inLanguage).toBe('en')
    })
  })
})

describe('jsonLd namespace', () => {
  it('should export all builders', () => {
    expect(typeof jsonLd.create).toBe('function')
    expect(typeof jsonLd.website).toBe('function')
    expect(typeof jsonLd.organization).toBe('function')
    expect(typeof jsonLd.person).toBe('function')
    expect(typeof jsonLd.article).toBe('function')
    expect(typeof jsonLd.product).toBe('function')
    expect(typeof jsonLd.breadcrumbs).toBe('function')
    expect(typeof jsonLd.faq).toBe('function')
    expect(typeof jsonLd.event).toBe('function')
    expect(typeof jsonLd.localBusiness).toBe('function')
    expect(typeof jsonLd.softwareApp).toBe('function')
    expect(typeof jsonLd.video).toBe('function')
    expect(typeof jsonLd.recipe).toBe('function')
    expect(typeof jsonLd.course).toBe('function')
    expect(typeof jsonLd.howTo).toBe('function')
    expect(typeof jsonLd.webpage).toBe('function')
  })
})
