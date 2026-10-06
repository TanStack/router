const { title, subtitle } = getCopy();
function getCopy() {
  return { title: 'Title', subtitle: 'Subtitle' };
}
const SplitComponent = () => (<div>
      {title} {subtitle}
    </div>);
export { SplitComponent as component };