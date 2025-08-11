import { createFileRoute } from '@tanstack/router'

// Test case 1: errorComponent: false
export const Route1 = createFileRoute('/test1')({
  component: () => <div>Test 1</div>,
  errorComponent: false,
})

// Test case 2: errorComponent: null
export const Route2 = createFileRoute('/test2')({
  component: () => <div>Test 2</div>,
  errorComponent: null,
})

// Test case 3: errorComponent with actual component (should work)
const ErrorComponent = () => <div>Error occurred</div>
export const Route3 = createFileRoute('/test3')({
  component: () => <div>Test 3</div>,
  errorComponent: ErrorComponent,
})
