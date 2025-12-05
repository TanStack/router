// Variable used ONLY in component (split part), NOT in loader
// Should NOT be exported from reference file or imported in split file
const onlySplit = new Map();
onlySplit.set('key', 'value');
function TestComponent() {
  // Only component uses onlySplit
  return <div>Size: {onlySplit.size}</div>;
}
export { TestComponent as component };