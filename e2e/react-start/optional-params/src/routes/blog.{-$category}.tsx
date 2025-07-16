import { Link } from '@tanstack/react-router'

// Mock blog data
const blogPosts = {
  tech: [
    {
      id: '1',
      title: 'React Best Practices',
      slug: 'react-best-practices',
      category: 'tech',
    },
    {
      id: '2',
      title: 'TypeScript Tips',
      slug: 'typescript-tips',
      category: 'tech',
    },
  ],
  design: [
    {
      id: '3',
      title: 'UI/UX Principles',
      slug: 'ui-ux-principles',
      category: 'design',
    },
  ],
  all: [
    {
      id: '1',
      title: 'React Best Practices',
      slug: 'react-best-practices',
      category: 'tech',
    },
    {
      id: '2',
      title: 'TypeScript Tips',
      slug: 'typescript-tips',
      category: 'tech',
    },
    {
      id: '3',
      title: 'UI/UX Principles',
      slug: 'ui-ux-principles',
      category: 'design',
    },
    {
      id: '4',
      title: 'Getting Started',
      slug: 'getting-started',
      category: 'general',
    },
  ],
}

export const Route = createFileRoute({
  component: BlogComponent,
})

function BlogComponent() {
  const { category } = Route.useParams()

  const posts =
    category && category !== 'all'
      ? blogPosts[category as keyof typeof blogPosts] || []
      : blogPosts.all

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-2xl font-bold mb-4">
          Blog {category ? `- ${category}` : '(All Categories)'}
        </h2>

        <div className="mb-6 flex gap-3">
          <Link
            to="/blog/{-$category}"
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
            data-testid="blog-all-link"
          >
            All Posts
          </Link>
          <Link
            to="/blog/{-$category}"
            params={{ category: 'tech' }}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
            data-testid="blog-tech-link"
          >
            Tech
          </Link>
          <Link
            to="/blog/{-$category}"
            params={{ category: 'design' }}
            className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 transition-colors"
            data-testid="blog-design-link"
          >
            Design
          </Link>
        </div>

        <div className="space-y-4">
          {posts.map((post) => (
            <div
              key={post.id}
              className="border border-gray-200 p-4 rounded-lg hover:shadow-md transition-shadow"
            >
              <h3 className="font-bold text-lg mb-2">{post.title}</h3>
              <p className="text-gray-600 text-sm">
                <span className="font-medium">Category:</span> {post.category}
              </p>
              <p className="text-gray-600 text-sm">
                <span className="font-medium">Slug:</span> {post.slug}
              </p>
            </div>
          ))}
          {posts.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No posts found in this category.
            </div>
          )}
        </div>
      </div>

      <div className="bg-blue-50 rounded-lg p-4">
        <h3 className="font-semibold mb-2">Current URL State</h3>
        <p className="text-sm text-gray-700">
          <span className="font-medium">Category parameter:</span>{' '}
          {category || 'undefined (no category)'}
        </p>
        <p className="text-sm text-gray-700 mt-1">
          <span className="font-medium">URL pattern:</span>{' '}
          <code>/blog/{'{-$category}'}</code>
        </p>
      </div>
    </div>
  )
}
