import { alias } from "./shared-alias-chain.tsx"; // Alias chain - ensure we track through aliases
function TestComponent() {
  return <div>{alias.name}</div>;
}
export { TestComponent as component };