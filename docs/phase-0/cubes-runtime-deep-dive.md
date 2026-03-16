# `nF` / Cubes Runtime Deep Dive

## Source of truth

- `../www.igloo.inc/assets/App3D-5907d20f.js:37654-38004`
  - Custom cube material `WL`
- `../www.igloo.inc/assets/App3D-5907d20f.js:38466-38520`
  - Cube text cluster coordinator `KL`
- `../www.igloo.inc/assets/App3D-5907d20f.js:38593-38665`
  - Mouse frost interaction render target `jL`
- `../www.igloo.inc/assets/App3D-5907d20f.js:38892-38993`
  - Plexus system `sF`
- `../www.igloo.inc/assets/App3D-5907d20f.js:38996-39363`
  - Per-project cube group `nF` and scene `aF`

## High-level conclusion

The original cubes section is not "three cubes in a scene".

It is a layered runtime made of:

- a custom transmissive cube material
- a per-cube mouse-reactive frost simulation
- an inner object pass
- a smoke billboard layer
- a plexus point/line system
- a text cluster for title / date / temp
- a scene-level transmission prepass
- scene-level background, blurry text, and background shapes

The current rebuild only reproduces part of the visible layout and camera motion. Most of the original surface language still lives in the missing runtime layers.

## Per-project object graph

Each project cube in `nF` contains:

- `mesh`
  - Main cube geometry using custom material `WL(3)`
- `mesh3`
  - Inner object geometry, shown during the transmission prepass
- `mesh2`
  - Smoke billboard plane
- `mouseFrost`
  - Offscreen render target used as a surface interaction map
- `plexus`
  - Animated point-line graph around the cube
- `texts`
  - Text block for project title / date / temp

That means a "cube" is really a mini-runtime, not a single mesh.

## `WL`: the real cube material

`WL` extends `MeshPhysicalMaterial`, but heavily rewrites the shader in `onBeforeCompile`.

It adds:

- custom transmission sampling using `tTransmissionSamplerMap`
- bicubic filtering for the transmission texture
- chromatic aberration inside the refraction path
- blue-noise driven sampling jitter
- `tMouseFrost`
  - surface frost interaction data
- `tTriangles`
  - triangle-pattern emissive texture
- roughness and normal response modified by frost amount
- emissive boost on frost rim and triangle highlights

This is the main reason the original cubes feel icy / glassy / alive instead of just reflective.

## `jL`: mouse frost is not a hover boolean

`jL` is a dedicated ping-pong render target that:

- raycasts against the cube mesh
- stores splat position and motion
- advects and damps the frost field over time
- exposes `soundVelocity`
- emits route changes on click

So the original cube surface is not only interactive visually, it is also a motion-derived audio input.

## `KL`: project text cluster

`KL` owns three child modules:

- title line
- type/date
- temp

It also plays randomized beep audio on reveal timing.

This matters because the original cubes section is not only geometry plus labels. Text timing and audio are bound together.

## `sF`: plexus system

Each cube has a local plexus runtime:

- floating points inside a bounded radius
- dynamic connections up to a max count
- click-triggered hover animation on points and lines
- visibility gated by scroll proximity

This is one of the biggest missing "complexity cues" in the rebuild. Without it, the cubes feel much flatter and less authored.

## Scene-level rendering in `aF`

The cubes scene itself adds:

- EXR environment map
- background scene elements
  - blurred text
  - background shapes
- a dedicated `_transmissionRT`
- camera FOV reaction to scroll velocity
- shard audio volume driven by the currently centered cube's frost motion

The scene renders in two phases:

1. Prepass into `_transmissionRT`
   - cubes rendered with inner objects visible
   - smoke, plexus, and text hidden
2. Final pass
   - cube material samples `_transmissionRT`
   - inner objects hidden
   - smoke, plexus, and texts shown

This prepass/final-pass split is essential. It is not optional polish.

## Detail handoff from cubes

`aF.detailAnimationIn()`:

- zooms camera in via `cameraZoom`
- kills extra cube rotation
- removes touch camera amount
- triggers plexus click animation

`aF.detailAnimationOut()`:

- restores camera zoom
- restores cube motion
- restores touch amount
- resets plexus click state

So the original handoff is not only a route change. The cubes scene actively prepares the outgoing state for detail.

## Why the rebuild still feels far from original

Current rebuild cubes section is still missing most of the authored runtime:

- no custom `WL` transmission material
- no transmission prepass
- no mouse frost simulation
- no plexus
- no title/date/temp runtime
- no smoke billboard per cube
- no shard audio feedback loop

That is why matching positions, assets, and camera lerps still does not produce the original feel.

## Practical migration order

Recommended implementation order:

1. Port the scene-level transmission prepass.
2. Port `WL` custom cube material.
3. Port `jL` mouse frost RT and wire it into click + audio.
4. Port `sF` plexus.
5. Port `KL` text runtime.
6. Restore smoke billboards and shard audio.

If you do these out of order, visual parity work will be harder because the cube surface and transition language will still be wrong.

## Minimum parity target

Before tuning lookdev further, cubes should at least regain:

- transmission prepass
- frost-driven refraction/emissive behavior
- plexus
- project text runtime

That is the minimum feature set where the section starts behaving like the original system.
