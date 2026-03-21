import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/inputs')({
  component: InputsPage,
})

function InputsPage() {
  return (
    <main>
      <h1 data-testid="inputs-heading">Uncontrolled Inputs</h1>
      <p data-testid="inputs-marker">inputs-baseline</p>
      <input data-testid="input-first" type="text" />
      <input data-testid="input-second" type="text" />
    </main>
  )
}
