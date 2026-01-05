import * as React from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
} from 'react-native'
import { createRoute, Link } from '@tanstack/react-native-router'
import { Route as RootRoute } from './__root'
import { ScreenHeader } from '../components/ScreenHeader'

type Post = {
  id: number
  title: string
  body: string
}

async function fetchPosts(): Promise<Post[]> {
  const response = await fetch(
    'https://jsonplaceholder.typicode.com/posts?_limit=10',
  )
  return response.json()
}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: 'posts',
  component: PostsScreen,
  loader: async () => {
    const posts = await fetchPosts()
    return { posts }
  },
  pendingComponent: () => (
    <View style={styles.loadingContainer}>
      <ScreenHeader title="Posts" showBack />
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Loading posts...</Text>
      </View>
    </View>
  ),
})

function PostsScreen() {
  const { posts } = Route.useLoaderData()

  return (
    <View style={styles.container}>
      <ScreenHeader title="Posts" showBack />
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <Link
            to="/posts/$postId"
            params={{ postId: item.id.toString() }}
            style={styles.postCard}
          >
            <Text style={styles.postTitle}>{item.title}</Text>
            <Text style={styles.postBody} numberOfLines={2}>
              {item.body}
            </Text>
            <Text style={styles.postArrow}>→</Text>
          </Link>
        )}
        contentContainerStyle={styles.list}
      />
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
  list: {
    padding: 16,
    gap: 12,
  },
  postCard: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    flexDirection: 'row',
    alignItems: 'center',
  },
  postTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#1f2937',
  },
  postBody: {
    display: 'none', // Hide body for cleaner list
  },
  postArrow: {
    fontSize: 18,
    color: '#9ca3af',
    marginLeft: 8,
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
