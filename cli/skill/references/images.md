# A Docker base image

## The call

```
npx sighttrue docker
```

Reads the `FROM` lines in a Dockerfile in the working directory. About fifteen
base images are tracked.

## What it means

**Last rebuilt.** An image that has not been rebuilt in months carries every OS
vulnerability published since, and no scanner reports that as a finding because
there is no advisory attached to the image itself. This is the question "when
was this last patched", which nothing else asks.

**Size.** What the layer weighs. A fact, not a problem.

**The OS underneath.** `node:18-alpine` inherits Alpine's support window. When
that window has closed, OS security patches have stopped regardless of how
recently the image was rebuilt. Cross-reference with `references/runtimes.md`.

## How to report it

Give the image reference exactly as the Dockerfile writes it, the rebuild date,
and the OS support position if the base is tracked.

An image outside the tracked set reports nothing either way. Say that rather
than implying it is fine.
