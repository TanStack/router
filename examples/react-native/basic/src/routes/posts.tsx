import * as React from 'react'
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from 'react-native'
import { createRoute, Link, Outlet } from '@tanstack/react-native-router'
import { Route as RootRoute } from './__root'

type Post = {
  id: number
  title: string
  body: string
}

async function fetchPosts(): Promise<Post[]> {
  const response = await fetch('https://jsonplaceholder.typicode.com/posts?_limit=10')
  return response.json()
}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/posts',
  component: PostsComponent,
  loader: async () => {
    const posts = await fetchPosts()
    return { posts }
  },
  pendingComponent: () => (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color="#6366f1" />
      <Text style={styles.loadingText}>Loading posts...</Text>
    </View>
  ),
})

function PostsComponent() {
  const { posts } = Route.useLoaderData()

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Posts</Text>
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
          </Link>
        )}
        contentContainerStyle={styles.list}
      />
      <Outlet />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 16,
  },
  list: {
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
  },
  postTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 8,
  },
  postBody: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
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
