// jsdom has no layout, so it cannot scroll. The router scrolls to the top
// after a navigation.
window.scrollTo = () => {}
