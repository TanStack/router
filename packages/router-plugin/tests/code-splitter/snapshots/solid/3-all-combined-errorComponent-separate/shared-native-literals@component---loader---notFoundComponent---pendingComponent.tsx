// Both output modules must use the same mutable native regex value.
const pattern = /[a-zé]+/giu;
const values = [123n, null, 'é😀', true] as const;
const SplitLoader = () => ({ matched: pattern.test('café'), value: values[0] });
export { SplitLoader as loader };
const SplitComponent = () => <div>{`${pattern.source}: ${values[0]}`}</div>;
export { SplitComponent as component };