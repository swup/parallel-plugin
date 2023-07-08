# Swup Parallel Plugin

A [swup](https://swup.js.org) plugin for running the in and out animations in parallel.

- Keep the previous container during the page transition
- Animate both the previous and current containers at the same time

## Installation

Install the plugin from npm and import it into your bundle.

```bash
npm install @swup/parallel-plugin
```

```js
import SwupParallelPlugin from '@swup/parallel-plugin';
```

Or include the minified production file from a CDN:

```html
<script src="https://unpkg.com/@swup/parallel-plugin@0"></script>
```

## Usage

To run this plugin, include an instance in the swup options.

```javascript
const swup = new Swup({
  plugins: [new SwupParallelPlugin()]
});
```

## Markup

In this example, we want to slide in the new `main` element while sliding out the previous `main`
element:

```html
<section>
  <header>
    My Website
  </header>
  <main id="swup" class="transition-slide">
    <h1>Welcome</h1>
  </main>
</section>
```

## Styling

Showing both the previous and current container during a page transition requires slightly more
complex styling than usual. The containers need to be layered on top of each other while they're
both in the DOM. The details depend on the specific layout, however the easiest way in most cases
is a CSS grid with both containers claiming the same row and column.

```css
/* Layout */

section {
  display: grid;
  grid-template-areas: "header"
                        "main";
  overflow: hidden;
}

section > * {
  min-width: 0;
}

section > header {
  grid-area: header;
}

section > main {
  grid-area: main;
}

/* Slide transition */

.is-changing .transition-slide {
  transition: transform 0.3s ease-in-out, opacity 0.3s ease-in-out;
}

.is-animating .transition-slide.is-next-container {
  transform: translateX(100%);
  opacity: 0;
}

.transition-slide.is-previous-container {
  transform: translateX(-100%);
  opacity: 0;
}
```

## Options

### containers

The containers that are visible at the same time. Usually only the main content container. Must be
a container normally replaced by swup.
