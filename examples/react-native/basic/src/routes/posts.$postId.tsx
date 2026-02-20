import * as React from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native'
import { createRoute, Link } from '@tanstack/react-native-router'
import { Route as RootRoute } from './__root'
import { ScreenHeader } from '../components/ScreenHeader'

type Post = {
  id: number
  title: string
  body: string
  userId: number
}

async function fetchPost(postId: string): Promise<Post> {
  const response = await fetch(
    `https://jsonplaceholder.typicode.com/posts/${postId}`,
  )
  return response.json()
}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: 'posts/$postId',
  nativeOptions: {
    presentation: 'push',
    gestureEnabled: true,
    animation: 'default',
  },
  component: PostScreen,
  loader: async ({ params }) => {
    const post = await fetchPost(params.postId)
    return { post }
  },
  pendingComponent: () => (
    <View style={styles.loadingContainer}>
      <ScreenHeader title="Loading..." showBack />
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Loading post...</Text>
      </View>
    </View>
  ),
})

function PostScreen() {
  const { post } = Route.useLoaderData()
  const { postId } = Route.useParams()

  return (
    <View style={styles.container}>
      <ScreenHeader title={`Post #${postId}`} showBack />
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
      >
        <View style={styles.card}>
          <Text style={styles.title}>{post.title}</Text>
          <Text style={styles.body}>{post.body}</Text>
          <View style={styles.meta}>
            <Text style={styles.metaLabel}>Author</Text>
            <Text style={styles.metaValue}>User #{post.userId}</Text>
          </View>
        </View>

        <Link
          to="/posts/$postId/deep"
          params={{ postId }}
          style={styles.deepLink}
        >
          <Text style={styles.deepLinkText}>View Comments →</Text>
        </Link>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
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
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 16,
    lineHeight: 30,
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
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metaLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  metaValue: {
    fontSize: 14,
    color: '#1f2937',
    fontWeight: '500',
  },
  deepLink: {
    marginTop: 16,
    paddingVertical: 16,
    backgroundColor: '#6366f1',
    borderRadius: 12,
    alignItems: 'center',
  },
  deepLinkText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
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
