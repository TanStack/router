import { FileRouteLoader } from '@tanstack/react-router'
import { fetchPosts } from '../posts'

export const loader = FileRouteLoader('/posts')(fetchPosts)
