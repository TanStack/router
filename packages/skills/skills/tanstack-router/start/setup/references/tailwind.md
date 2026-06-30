# Tailwind Integration

Setup Tailwind CSS with TanStack Start.

## Installation

```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

## Configuration

```js
// tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./app/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

## CSS Entry Point

```css
/* app/styles/globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;
```

## Import in Root

```tsx
// app/routes/__root.tsx
import '../styles/globals.css'

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className="min-h-screen bg-gray-50">
        <Outlet />
      </body>
    </html>
  )
}
```

## Vite Config (if needed)

```ts
// app.config.ts
import { defineConfig } from '@tanstack/start/config'

export default defineConfig({
  vite: {
    css: {
      postcss: './postcss.config.js',
    },
  },
})
```

## Using with Components

```tsx
function Button({ children, variant = 'primary' }) {
  const styles = {
    primary: 'bg-blue-500 hover:bg-blue-600 text-white',
    secondary: 'bg-gray-200 hover:bg-gray-300 text-gray-800',
  }

  return (
    <button className={`px-4 py-2 rounded ${styles[variant]}`}>
      {children}
    </button>
  )
}
```

## Dark Mode

```js
// tailwind.config.js
export default {
  darkMode: 'class', // or 'media'
  // ...
}
```

```tsx
function ThemeToggle() {
  const [dark, setDark] = useState(false)

  return (
    <html className={dark ? 'dark' : ''}>
      <body className="bg-white dark:bg-gray-900">
        <button onClick={() => setDark(!dark)}>Toggle Theme</button>
      </body>
    </html>
  )
}
```

## Tailwind Plugins

```bash
npm install -D @tailwindcss/typography @tailwindcss/forms
```

```js
// tailwind.config.js
export default {
  plugins: [require('@tailwindcss/typography'), require('@tailwindcss/forms')],
}
```
