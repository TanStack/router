import {
  Header,
  Card,
  registry,
  label,
  Table,
} from 'shared-components-and-values.tsx?tsr-shared=1'
function Page() {
  return (
    <main>
      <Header />
      <Card />
      <Table />
    </main>
  )
}
const SplitLoader = () => label(registry.size)
export { SplitLoader as loader }
export { Page as component }
