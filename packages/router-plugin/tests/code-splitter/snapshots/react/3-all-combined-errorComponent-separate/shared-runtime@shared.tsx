enum Count {
  Initial = 0
}
namespace Labels {
  export const component = 'count';
}
const seed = createSeed();
const { state, increment } = createState(seed);
function createSeed() {
  console.log('shared-runtime:seed');
  return { count: Count.Initial, label: Labels.component };
}
function createState(initialState: {
  count: number;
}): {
  state: {
    count: number;
  };
  increment: () => number;
};
function createState(initialState: {
  count: number;
}) {
  console.log('shared-runtime:state');
  return { state: initialState, increment: () => initialState.count++ };
}
export { Count, Labels, createSeed, createState, increment, seed, state };