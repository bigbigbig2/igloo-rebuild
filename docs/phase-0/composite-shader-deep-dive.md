# `f3` Composite Shader Deep Dive

## Source of truth

- `../www.igloo.inc/assets/App3D-5907d20f.js:32328-32520`
  - Fullscreen composite material `f3`
- `../www.igloo.inc/assets/App3D-5907d20f.js:44576-44768`
  - Main controller `jF` render loop and route transition flow

## What the original system is doing

The original site does not switch home scenes by calling `renderer.render(sceneA)` and then crossfading to `sceneB`.

It renders the currently visible scroll scenes into offscreen composers, then feeds those textures into one fullscreen material. That material also owns the cubes-to-detail transition.

In other words:

- home scene transition
- cubes scene availability
- detail overlay transition
- velocity-reactive distortion

are all controlled by one global composite shader.

## Uniforms that matter

From `f3`:

- `tScene1`
  - Current visible home scene texture
- `tScene2`
  - Next visible home scene texture
- `tScroll`
  - Scroll transition data texture
- `tBlue`
  - Blue-noise texture for seam hiding / chromatic aberration masking
- `tFrost`
  - Frost data texture used during detail transition
- `tCubes`
  - Cubes scene texture, kept available even when another scene is visible
- `tDetail`
  - Detail scene texture
- `uProgress`
  - Home scene handoff progress
- `uProgressVel`
  - Scroll velocity
- `uInCubes`
  - Whether the current visible section is cubes
- `uDetailProgress`
  - Main detail reveal progress
- `uDetailProgress2`
  - Secondary delayed detail reveal progress

## Render pipeline in the original runtime

Main controller flow in `jF.render()`:

1. Compute current visible scroll position and resolve which home scenes are on screen.
2. Render the current visible scene into `tScene1`.
3. Render the next visible scene into `tScene2`.
4. Always keep the cubes composer output bound to `tCubes`.
5. When detail is open, render detail composer into `tDetail`.
6. Hand everything to the fullscreen material on the global triangle mesh.

This is why the original site feels like a single authored film-strip instead of separate sections being swapped.

## Shader behavior

### 1. Home section transition branch

When `uProgress > 0.0`, the shader enters the home-scene transition branch.

It does not use a plain mix:

- `tScroll.r`
  - ice-like cut mask
- `tScroll.g`
  - tech displacement control
- `tScroll.b`
  - slope displacement control
- `uProgressVel`
  - adds motion-reactive intensity
- `tBlue`
  - hides chromatic aberration seams

The result is:

- a slanted cut
- texture-driven displacement
- chromatic aberration near the cut
- parallax-like push between scene A and scene B

### 2. Cubes -> detail branch

When `uProgress == 0.0`, `uInCubes == true`, and `uDetailProgress > 0.0`, the shader switches to the detail branch.

This branch is staged:

- `uDetailProgress`
  - starts the broad scene-to-detail takeover
- `uDetailProgress2`
  - delays the cleanup / stabilization of the detail image

It also combines two displacement languages:

- frost displacement from `tFrost`
- tech displacement from `tScroll`

And it blends:

- `tCubes`
  - outgoing cubes scene
- `tDetail`
  - incoming detail scene

using a delayed `transition = fit(uDetailProgress, 0.4, 1.0, 0.0, 1.0)`.

That delayed handoff is a major reason the original transition feels layered instead of abrupt.

## Why the rebuild still feels far away

Current rebuild compositor in `src/runtime/HomeSceneRenderer.js` is structurally useful, but visually much simpler:

- no `tScroll` data-texture-driven cut
- no `tFrost`
- no blue-noise seam hiding
- no dual-phase detail progression
- no cubes texture being treated as a dedicated outgoing source
- no velocity-reactive scroll transition logic

So even if scene content gets closer, the global transition language will still feel wrong until this layer is rebuilt.

## Practical migration order

Recommended order for rebuild:

1. Port the fullscreen compositor shape first.
2. Add the missing data textures: scroll, frost, blue noise.
3. Split detail transition into two progress channels, not one.
4. Feed `tCubes` and `tDetail` separately instead of only doing a generic overlay blend.
5. Tune scroll velocity and cut behavior last.

## Minimum parity target

The rebuild should not aim for "nicer crossfade".

The minimum useful parity target is:

- texture-driven home scene cut
- separate cubes and detail sources
- two-stage detail reveal
- blue-noise-assisted chromatic aberration

Without those four, the runtime will keep reading as a reconstruction instead of the original authored pipeline.
