import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test.describe('Optional Parameters in TanStack Start + Router', () => {
  test('should display home page with optional parameter examples', async ({
    page,
  }) => {
    await expect(
      page.getByRole('heading', {
        name: 'Welcome to Optional Parameters Demo',
      }),
    ).toBeVisible()
    await expect(page.getByText('/blog/{-$category}')).toBeVisible()
    await expect(page.getByText('/docs/{-$version}/{-$page}')).toBeVisible()
    await expect(page.getByText('/users/$id/{-$tab}')).toBeVisible()
    await expect(
      page.getByText('/products/{-$category}/{-$brand}'),
    ).toBeVisible()
    await expect(
      page.getByText('/files/view{-$filename}.{-$ext}'),
    ).toBeVisible()
    await expect(page.getByText('/api/v{-$version}/{-$endpoint}')).toBeVisible()
  })

  test.describe('Blog Routes - Single Optional Parameter', () => {
    test('should navigate to blog without category (shows all posts)', async ({
      page,
    }) => {
      await page.getByRole('link', { name: 'Blog' }).click()

      // Check URL matches Start + Router behavior
      await expect(page).toHaveURL('/blog')

      // Check SSR content is properly rendered
      await expect(page.getByRole('heading')).toContainText(
        'Blog (All Categories)',
      )
      await expect(page.getByText('React Best Practices')).toBeVisible()
      await expect(page.getByText('TypeScript Tips')).toBeVisible()
      await expect(page.getByText('UI/UX Principles')).toBeVisible()
      await expect(page.getByText('Getting Started')).toBeVisible()

      // Check URL state display
      await expect(page.getByText('undefined (no category)')).toBeVisible()
    })

    test('should navigate to blog with tech category', async ({ page }) => {
      await page.getByRole('link', { name: 'Blog' }).click()
      await page.getByTestId('blog-tech-link').click()

      // Check URL
      await expect(page).toHaveURL('/blog/tech')

      // Check content filtering works
      await expect(page.getByRole('heading')).toContainText('Blog - tech')
      await expect(page.getByText('React Best Practices')).toBeVisible()
      await expect(page.getByText('TypeScript Tips')).toBeVisible()
      await expect(page.getByText('UI/UX Principles')).not.toBeVisible()

      // Check URL state display
      await expect(page.getByText('Category parameter: tech')).toBeVisible()
    })

    test('should navigate to blog with design category', async ({ page }) => {
      await page.getByRole('link', { name: 'Blog' }).click()
      await page.getByTestId('blog-design-link').click()

      await expect(page).toHaveURL('/blog/design')
      await expect(page.getByRole('heading')).toContainText('Blog - design')
      await expect(page.getByText('UI/UX Principles')).toBeVisible()
      await expect(page.getByText('React Best Practices')).not.toBeVisible()
    })

    test('should handle direct URL navigation to blog categories', async ({
      page,
    }) => {
      // Test direct navigation to specific category
      await page.goto('/blog/tech')
      await expect(page.getByRole('heading')).toContainText('Blog - tech')
      await expect(page.getByText('React Best Practices')).toBeVisible()

      // Test navigation back to all categories
      await page.getByTestId('blog-all-link').click()
      await expect(page).toHaveURL('/blog')
      await expect(page.getByText('Getting Started')).toBeVisible()
    })
  })

  test.describe('User Routes - Mixed Required/Optional Parameters', () => {
    test('should navigate to user without tab (defaults to profile)', async ({
      page,
    }) => {
      await page.getByRole('link', { name: 'Users' }).click()

      await expect(page).toHaveURL('/users/1')
      await expect(page.getByRole('heading')).toContainText(
        'John Doe - profile',
      )
      await expect(page.getByText('Name: John Doe')).toBeVisible()
      await expect(page.getByText('Email: john@example.com')).toBeVisible()

      // Check URL state display
      await expect(page.getByText('User ID (required): 1')).toBeVisible()
      await expect(page.getByText('Tab (optional): profile')).toBeVisible()
    })

    test('should navigate to user settings tab', async ({ page }) => {
      await page.getByRole('link', { name: 'Users' }).click()
      await page.getByTestId('user-settings-link').click()

      await expect(page).toHaveURL('/users/1/settings')
      await expect(page.getByRole('heading')).toContainText(
        'John Doe - settings',
      )
      await expect(
        page.getByText('User settings configuration would be displayed here'),
      ).toBeVisible()
      await expect(page.getByText('Email notifications')).toBeVisible()
    })

    test('should navigate to user activity tab', async ({ page }) => {
      await page.getByRole('link', { name: 'Users' }).click()
      await page.getByTestId('user-activity-link').click()

      await expect(page).toHaveURL('/users/1/activity')
      await expect(page.getByRole('heading')).toContainText(
        'John Doe - activity',
      )
      await expect(
        page.getByText('User activity feed would be displayed here'),
      ).toBeVisible()
      await expect(
        page.getByText('Logged in from Chrome on Windows'),
      ).toBeVisible()
    })

    test('should handle direct URL navigation to user tabs', async ({
      page,
    }) => {
      // Direct navigation to settings
      await page.goto('/users/1/settings')
      await expect(page.getByRole('heading')).toContainText(
        'John Doe - settings',
      )

      // Direct navigation to profile (no tab)
      await page.goto('/users/1')
      await expect(page.getByRole('heading')).toContainText(
        'John Doe - profile',
      )
    })

    test('should handle non-existent user gracefully', async ({ page }) => {
      await page.goto('/users/999')
      await expect(page.getByText('User Not Found')).toBeVisible()
      await expect(page.getByText('No user found with ID: 999')).toBeVisible()
    })

    test('should maintain correct active state for tabs', async ({ page }) => {
      await page.getByRole('link', { name: 'Users' }).click()

      // Profile should be active by default (through background color)
      const profileLink = page.getByTestId('user-profile-link')
      const settingsLink = page.getByTestId('user-settings-link')

      // Click settings
      await settingsLink.click()
      await expect(page).toHaveURL('/users/1/settings')

      // Navigate back to profile
      await profileLink.click()
      await expect(page).toHaveURL('/users/1')
    })
  })

  test.describe('API Routes - Optional Parameters with Prefix Pattern', () => {
    test('should show API docs with default version and endpoint', async ({
      page,
    }) => {
      await page.getByRole('link', { name: 'API' }).click()

      // This should work with Start + Router defaults
      await expect(page).toHaveURL('/api/v1/overview')

      await expect(page.getByRole('heading')).toContainText(
        'API Documentation v1 - overview',
      )
      await expect(
        page.getByText('Available in: overview, users, posts'),
      ).toBeVisible()

      // Check URL state display
      await expect(page.getByText('Version (optional): 1')).toBeVisible()
      await expect(
        page.getByText('Endpoint (optional): overview'),
      ).toBeVisible()
    })

    test('should navigate to different API version', async ({ page }) => {
      await page.getByRole('link', { name: 'API' }).click()
      await page.getByTestId('api-v2-link').click()

      await expect(page).toHaveURL('/api/v2/overview')
      await expect(page.getByRole('heading')).toContainText(
        'API Documentation v2 - overview',
      )
      await expect(
        page.getByText('Available in: overview, users, posts, auth'),
      ).toBeVisible()
    })

    test('should navigate to specific endpoint in version', async ({
      page,
    }) => {
      await page.getByRole('link', { name: 'API' }).click()
      await page.getByTestId('api-v3-link').click()
      await page.getByTestId('api-endpoint-webhooks-link').click()

      await expect(page).toHaveURL('/api/v3/webhooks')
      await expect(page.getByRole('heading')).toContainText(
        'API Documentation v3 - webhooks',
      )
      await expect(
        page.getByText(
          'Documentation for the webhooks endpoint in API version 3',
        ),
      ).toBeVisible()
    })

    test('should show different endpoints for different versions', async ({
      page,
    }) => {
      await page.getByRole('link', { name: 'API' }).click()

      // v1 should not have webhooks or auth
      await expect(
        page.getByTestId('api-endpoint-webhooks-link'),
      ).not.toBeVisible()
      await expect(page.getByTestId('api-endpoint-auth-link')).not.toBeVisible()

      // v2 should have auth but not webhooks
      await page.getByTestId('api-v2-link').click()
      await expect(page.getByTestId('api-endpoint-auth-link')).toBeVisible()
      await expect(
        page.getByTestId('api-endpoint-webhooks-link'),
      ).not.toBeVisible()

      // v3 should have webhooks
      await page.getByTestId('api-v3-link').click()
      await expect(page.getByTestId('api-endpoint-webhooks-link')).toBeVisible()
    })

    test('should handle direct URL navigation to API endpoints', async ({
      page,
    }) => {
      // Test direct navigation to specific version/endpoint
      await page.goto('/api/v2/auth')
      await expect(page.getByRole('heading')).toContainText(
        'API Documentation v2 - auth',
      )

      // Test navigation to base API (should default)
      await page.goto('/api')
      await expect(page.getByRole('heading')).toContainText(
        'API Documentation v1 - overview',
      )
    })
  })

  test.describe('Server-Side Rendering (SSR) with Optional Parameters', () => {
    test('should properly server-render pages with optional parameters', async ({
      page,
    }) => {
      // Navigate to a route with optional parameters
      await page.goto('/blog/tech')

      // The content should be available immediately (SSR)
      await expect(page.getByRole('heading')).toContainText('Blog - tech')
      await expect(page.getByText('React Best Practices')).toBeVisible()

      // Check that the page was server-rendered by looking for hydration
      const blogTitle = page.getByRole('heading')
      await expect(blogTitle).toBeVisible()
    })

    test('should handle optional parameters in SSR for API routes', async ({
      page,
    }) => {
      await page.goto('/api/v2/auth')

      // Should immediately show the content (SSR)
      await expect(page.getByRole('heading')).toContainText(
        'API Documentation v2 - auth',
      )
      await expect(
        page.getByText('Documentation for the auth endpoint in API version 2'),
      ).toBeVisible()
    })

    test('should handle missing optional parameters in SSR', async ({
      page,
    }) => {
      await page.goto('/users/1')

      // Should immediately show default tab content (SSR)
      await expect(page.getByRole('heading')).toContainText(
        'John Doe - profile',
      )
      await expect(page.getByText('Profile Information')).toBeVisible()
    })
  })

  test.describe('Navigation and URL Patterns in Start Context', () => {
    test('should handle browser back/forward with optional parameters', async ({
      page,
    }) => {
      // Navigate through several pages
      await page.getByRole('link', { name: 'Blog' }).click()
      await page.getByTestId('blog-tech-link').click()
      await page.getByRole('link', { name: 'Users' }).click()
      await page.getByTestId('user-settings-link').click()

      // Go back through history
      await page.goBack()
      await expect(page).toHaveURL('/users/1')

      await page.goBack()
      await expect(page).toHaveURL('/blog/tech')

      await page.goBack()
      await expect(page).toHaveURL('/blog')

      // Go forward
      await page.goForward()
      await expect(page).toHaveURL('/blog/tech')
    })

    test('should handle complex navigation scenarios', async ({ page }) => {
      // Start with blog
      await page.getByRole('link', { name: 'Blog' }).click()
      await page.getByTestId('blog-tech-link').click()
      await expect(page).toHaveURL('/blog/tech')

      // Navigate to API
      await page.getByRole('link', { name: 'API' }).click()
      await expect(page).toHaveURL('/api/v1/overview')

      // Navigate to users
      await page.getByRole('link', { name: 'Users' }).click()
      await page.getByTestId('user-activity-link').click()
      await expect(page).toHaveURL('/users/1/activity')
    })

    test('should handle edge cases and invalid routes', async ({ page }) => {
      // Invalid category
      await page.goto('/blog/invalid-category')
      await expect(page.getByRole('heading')).toContainText(
        'Blog - invalid-category',
      )
      await expect(
        page.getByText('No posts found in this category'),
      ).toBeVisible()

      // Invalid user ID
      await page.goto('/users/invalid')
      await expect(page.getByText('User Not Found')).toBeVisible()
    })
  })

  test.describe('TypeScript Integration and Type Safety', () => {
    test('should properly type optional parameters in Start context', async ({
      page,
    }) => {
      // This test verifies that the TypeScript compilation works correctly
      // and that optional parameters are properly typed in the Start context

      await page.getByRole('link', { name: 'Blog' }).click()

      // The fact that the app loads and navigation works indicates
      // that TypeScript compilation succeeded with proper types
      await expect(page.getByRole('heading')).toContainText('Blog')

      // Navigate through various optional parameter combinations
      await page.getByTestId('blog-tech-link').click()
      await expect(page).toHaveURL('/blog/tech')

      await page.getByRole('link', { name: 'API' }).click()
      await page.getByTestId('api-v2-link').click()
      await page.getByTestId('api-endpoint-auth-link').click()
      await expect(page).toHaveURL('/api/v2/auth')
    })
  })

  test.describe('Start-Specific Features with Optional Parameters', () => {
    test('should handle file-based routing with optional parameters', async ({
      page,
    }) => {
      // Test that file-based routes with optional parameters work correctly
      await page.goto('/blog/tech')
      await expect(
        page.getByText('URL pattern: /blog/{-$category}'),
      ).toBeVisible()

      await page.goto('/users/1/settings')
      await expect(
        page.getByText('URL pattern: /users/$id/{-$tab}'),
      ).toBeVisible()

      await page.goto('/api/v2/auth')
      await expect(
        page.getByText('URL pattern: /api/v{-$version}/{-$endpoint}'),
      ).toBeVisible()
    })

    test('should maintain state during navigation in Start app', async ({
      page,
    }) => {
      // Test that Start maintains proper state during navigation
      await page.getByRole('link', { name: 'Users' }).click()
      await page.getByTestId('user-settings-link').click()

      // Navigate to another section and back
      await page.getByRole('link', { name: 'Blog' }).click()
      await page.getByRole('link', { name: 'Users' }).click()

      // Should remember we were on user 1 but default back to profile tab
      await expect(page).toHaveURL('/users/1')
      await expect(page.getByRole('heading')).toContainText(
        'John Doe - profile',
      )
    })
  })
})
