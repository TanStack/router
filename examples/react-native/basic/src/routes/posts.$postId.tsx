import * as React from 'react'
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native'
import { createRoute, Link } from '@tanstack/react-native-router'
import { Route as PostsRoute } from './posts'

type Post = {
  id: number
  title: string
  body: string
  userId: number
}

async function fetchPost(postId: string): Promise<Post> {
  const response = await fetch(
    `https://jsonplaceholder.typicode.com/posts/${postId}`
  )
  return response.json()
}

export const Route = createRoute({
  getParentRoute: () => PostsRoute,
  path: '$postId',
  component: PostComponent,
  loader: async ({ params }) => {
    const post = await fetchPost(params.postId)
    return { post }
  },
  pendingComponent: () => (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color="#6366f1" />
      <Text style={styles.loadingText}>Loading post...</Text>
    </View>
  ),
})

function PostComponent() {
  const { post } = Route.useLoaderData()
  const { postId } = Route.useParams()

  return (
    <ScrollView style={styles.container}>
      <Link to="/posts" style={styles.backLink}>
        <Text style={styles.backText}>← Back to Posts</Text>
      </Link>
      <View style={styles.card}>
        <Text style={styles.postId}>Post #{postId}</Text>
        <Text style={styles.title}>{post.title}</Text>
        <Text style={styles.body}>{post.body}</Text>
        <View style={styles.meta}>
          <Text style={styles.metaText}>User ID: {post.userId}</Text>
        </View>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  backLink: {
    marginBottom: 16,
  },
  backText: {
    fontSize: 16,
    color: '#6366f1',
    fontWeight: '500',
  },
  card: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  postId: {
    fontSize: 12,
    color: '#9ca3af',
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 16,
    lineHeight: 32,
  },
  body: {
    fontSize: 16,
    color: '#4b5563',
    lineHeight: 26,
    marginBottom: 20,
  },
  meta: {
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 16,
  },
  metaText: {
    fontSize: 14,
    color: '#6b7280',
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 16,
    color: '#6b7280',
  },
})
