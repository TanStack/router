---
id: reading-and-writing-file
title: Building a Full Stack DevJokes App with TanStack Start
---

 This guide demonstrates how to integrate external API calls into your TanStack Start application using route loaders. We will use TMDB API to fetch popular movies using TanStack Start and understand how to fetch data in a TanStack Start app.

<!-- TODO: Add repo for tanstack netflix -->
The complete code for this tutorial is available on [GitHub](https://github.com/shrutikapoor08/devjokes).


## What You'll Learn
1. Setting up external API integration with TanStack Start
1. Implementing route loaders for server-side data fetching
1. Building responsive UI components with fetched data
1. Handling loading states and error management

## Prerequisites

- Basic knowledge of React and TypeScript
- Node.js and `pnpm` installed on your machine
- A TMDB API key (free at themoviedb.org)


## Nice to know
- [TanStack Router](https://tanstack.com/router/latest/docs/framework/react/routing/routing-concepts)

## Setting up a TanStack Start Project

First, let's create a new TanStack Start project:

```bash
pnpx create-start-app movie-discovery
cd movie-discovery
```

When this script runs, it will ask you a few setup questions. You can either pick choices that work for you or just press enter to accept the defaults.

Optionally, you can pass in a `--add-on` flag to get options such as Shadcn, Clerk, Convex, TanStack Query, etc.

Once setup is complete, install dependencies and start the development server:

```bash
pnpm i
pnpm dev
```


Once your project is set up, you can access your app at `localhost:3000`. You should see the default TanStack Start welcome page.

## Step 1: Setup a .env file with TMDB_AUTH_TOKEN
In order to fetch the API for fetching movies, we will need an `auth_token`. You can get this at https://www.themoviedb.org/. 

First, let's set up environment variables for our API key. Create a .env.local file in your project root:

```
touch .env.local

```


Add your TMDB API token to this file:
```
TMDB_AUTH_TOKEN=your_bearer_token_here
```

*Important*: Make sure to add .env.local to your .gitignore file to keep your API keys secure.


## Step 2: Defining Data Types

Let's create TypeScript interfaces for our movie data. Create a new file at `src/types/movie.ts`:

```ts
// src/types/movie.ts
export interface Movie {
  id: number
  title: string
  overview: string
  poster_path: string | null
  backdrop_path: string | null
  release_date: string
  vote_average: number
  popularity: number
}

export interface TMDBResponse {
  page: number
  results: Movie[]
  total_pages: number
  total_results: number
}
```

## Step 3: Creating the API Fetch Function
Now let's create a function to fetch popular movies from the TMDB API. Create a new file at src/routes/fetch-movies.tsx:


```ts
const API_URL = 'https://api.themoviedb.org/3/discover/movie?include_adult=false&include_video=false&language=en-US&page=1&sort_by=popularity.desc'

async function fetchPopularMovies(): Promise<TMDBResponse> {
  const response = await fetch(
    API_URL,
    {
      headers: {
        'accept': 'application/json',
        'Authorization': `Bearer ${process.env.TMDB_AUTH_TOKEN}`,
      },
    }
  )
  
  if (!response.ok) {
    throw new Error(`Failed to fetch movies: ${response.statusText}`)
  }
  
  return response.json()
}

```

## Step 4: Creating the Route with Loader
Now let's setup our route that uses loader to fetch data.  

```tsx
export const Route = createFileRoute('/fetch-movies')({
  component: MoviesPage,
  loader: async () => {
    try {
      const moviesData = await fetchPopularMovies()
      return { movies: moviesData.results, error: null }
    } catch (error) {
      console.error('Error fetching movies:', error)
      return { movies: [], error: 'Failed to load movies' }
    }
  },
})


```

## Step 5: Consuming loader data in MoviesPage component

Finally, lets consume the movies data by calling `Route.useLoaderData()`

```jsx

const MoviesPage = () => {
  const { movies, error } = Route.useLoaderData()

  return (
    <div
      className="flex items-center justify-center min-h-screen p-4 text-white"
      style={{
        backgroundColor: '#000',
        backgroundImage:
          'radial-gradient(ellipse 60% 60% at 0% 100%, #444 0%, #222 60%, #000 100%)',
      }}
      role="main"
      aria-label="Popular Movies Section"
    >
      <div className="w-full max-w-6xl p-8 rounded-xl backdrop-blur-md bg-black/50 shadow-xl border-8 border-black/10">
        <h1 className="text-3xl mb-6 font-bold text-center">Popular Movies</h1>

        {error && (
          <div className="text-red-400 text-center mb-4 p-4 bg-red-900/20 rounded-lg" role="alert" tabIndex={0}>
            {error}
          </div>
        )}

        {movies.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6" aria-label="Movie List">
            {movies.slice(0, 12).map((movie) => (
              <MovieCard key={movie.id} movie={movie} />
            ))}
          </div>
        ) : (
          !error && (
            <div className="text-center text-gray-400" role="status" tabIndex={0}>
              Loading movies...
            </div>
          )
        )}
      </div>
    </div>
  )
}

//MovieCard component
const MovieCard = ({ movie }: { movie: Movie }) => {
  return (
    <div
      className="bg-white/10 border border-white/20 rounded-lg overflow-hidden backdrop-blur-sm shadow-md hover:shadow-xl transition-all duration-300 hover:scale-105"
      aria-label={`Movie: ${movie.title}`}
      tabIndex={0}
      role="group"
    >
      {movie.poster_path && (
        <img
          src={`https://image.tmdb.org/t/p/w500${movie.poster_path}`}
          alt={movie.title}
          className="w-full h-64 object-cover"
        />
      )}
      <div className="p-4">
        <MovieDetails movie={movie} />
      </div>
    </div>
  )
}

//MovieDetails component
const MovieDetails = ({ movie }: { movie: Movie }) => {
  return (
    <>
      <h3 className="text-lg font-semibold mb-2 line-clamp-2">
        {movie.title}
      </h3>
      <p className="text-sm text-gray-300 mb-3 line-clamp-3 h-10">
        {movie.overview}
      </p>
      <div className="flex justify-between items-center text-xs text-gray-400">
        <span>{movie.release_date}</span>
        <span className="flex items-center">
          ⭐️ {movie.vote_average.toFixed(1)}
        </span>
      </div>
    </>
  )
}



```

So far, we have done the following - 
1. We're using `createFileRoute` to create a route with a loader
2. The loader function runs on the server during SSR and fetches our movie data
3. We're handling errors gracefully by returning an error state
4. The component uses `Route.useLoaderData()` to access the fetched data
5. We're implementing proper accessibility features with ARIA labels





## Understanding How It All Works Together
Let's break down how the different parts of our application work together:

1. Route Loader: When a user visits /demo/start/fetch-api, the loader function runs
2. API Call: The loader calls fetchPopularMovies() which makes an HTTP request to TMDB
3. Server-Side Rendering: The data is fetched on the server, ensuring it's available immediately
4. Component Rendering: The MoviesPage component receives the data via `useLoaderData()`
5. UI Display: The movie cards are rendered with the fetched data

## Why This is Good
1. Server Rendered: Movies are rendered on the server, making them visible to search engines and reducing load on the client side. 
2. Fast Loading: Data is available immediately when the page loads
3. Error Handling: Graceful handling of API failures
4. Type Safety: Full TypeScript support throughout the data flow

## Step 6: Testing Your Application
If everything worked correctly, you should be able to see the popular movies 


<TODO: Add image of movies rendered>


Next Step - Making movie details inteactive and imporoving data handling using TanStack Query