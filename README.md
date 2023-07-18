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
element. The markup for parallel animations isn't any different from normal animations.

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

### State during the animation

During the animation, both containers will be in the DOM at the same time.
Swup has inserted the next container, will wait for any animations to finish, and
then remove the previous container.

Note: the next container is always inserted **before** the previous one, which
is marked as hidden from screen readers.

```html
<section>
  <header>
    My Website
  </header>
  <!-- Next container -->
  <main id="swup" class="transition-slide is-next-container">
    <h1>Next page</h1>
  </main>
    <!-- Previous container -->
  <main id="swup" class="transition-slide is-previous-container" aria-hidden="true">
    <h1>Previous page</h1>
  </main>
</section>
```

## Styling

### Basic styling for parallel animations

Showing both the previous and current container during a page transition requires slightly more
complex styling than usual. The containers need to be layered on top of each other while they're
both in the DOM.

The details depend on the specific layout, however the easiest way in most cases
is a CSS `grid` with both containers claiming the same row and column.
This type of layout avoids messy absolute positioning and scroll offsets.

```css
/* Layout */

section {
  display: grid;
  overflow: hidden;
  grid-template-areas: "header"
                        "main";
}

section > header {
  grid-area: header;
}

section > main {
  grid-area: main;
}
```

### Defining the animations

Instead of using swup's default classes for timing
the animation, parallel animations can be controlled using the classes `is-previous-container` and `is-next-container` on the containers themselves.

```css
/* Parallel animation timing */
.is-changing .transition-slide {
  transition: transform 0.3s ease-in-out, opacity 0.3s ease-in-out;
}

/* Style of next container when done */
.transition-slide.is-next-container {
  transform: translateX(100%);
  opacity: 0;
}

/* Style of previous container when done */
.transition-slide.is-previous-container {
  transform: translateX(-100%);
  opacity: 0;
}
```

## Timing

Technically, the plugin will skip the out-animation, add the next container, wait for animations to
finish, then remove the previous container. All animations now happen in the in-phase of the
lifecycle, after the `content:replace` hook that normally marks the middle of the animation
process. Any containers that are not animated or not animated in parallel (e.g. a static header)
will be replaced at the start of the parallel animation.

## Options

### containers

The containers that are visible at the same time. Usually only the main content container. Must be
a container normally replaced by swup. If not specified, defaults to running all
animations in parallel.

## API

### Opting out of parallel animations

The plugin will set a flag on the global context, indicating the current visit
as a parallel animation: `context.animation.parallel`. You can unset this flag
to fall back to a normal animation with leave and enter in series.

```js
// Disable parallel animations for this visit
swup.hooks.on('visit:start', (context) => {
  if (someCondition) {
    context.animation.parallel = false;
  }
});
```
