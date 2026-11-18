---
'@tanstack/router-devtools-core': patch
---

The devtools no longer use goober. Their styles are now a static stylesheet adopted into the document or shadow root the devtools render in, instead of a `<style>` element in `<head>`. This means:

- The devtools are styled on pages with a Content Security Policy that blocks inline `<style>` elements, without a nonce.
- Devtools rendered inside a shadow root are styled without passing `shadowDOMTarget`.
- The devtools no longer write to the shared `#_goober` style element.
- Browsers without adoptable stylesheets (before Safari 16.4 and Firefox 101) show the devtools unstyled.
