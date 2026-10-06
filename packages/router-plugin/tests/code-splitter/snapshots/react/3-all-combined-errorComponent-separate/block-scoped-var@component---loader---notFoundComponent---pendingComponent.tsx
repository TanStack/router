if (typeof window === 'undefined') {
  var environment = 'server';
}
for (var index = 0; index < 3; index++) {}
const SplitLoader = () => index;
export { SplitLoader as loader };
const SplitComponent = () => (<div>
      {environment} {index}
    </div>);
export { SplitComponent as component };