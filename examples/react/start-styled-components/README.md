# Example

To run this example:

- `npm install` or `yarn`
- `npm start` or `yarn start`

## How this works

This example uses [styled-components](https://styled-components.com/) to style the components. The `styled` function is used to create styled components, which can be used just like regular React components.

To support server-side rendering, the `ServerStyleSheet` from `styled-components` is used to collect styles during the server render. The styles are then injected into the HTML response.
