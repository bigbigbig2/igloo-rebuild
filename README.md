# Igloo Rebuild

This repository is the clean-room reconstruction workspace for the dumped `www.igloo.inc` production build.

## Planning Docs

- `docs/reverse-engineering-roadmap.md`
  - Reverse-engineering analysis, migration order and reconstruction roadmap.
- `docs/igloo-rebuild-architecture.md`
  - Chinese architecture doc for the current rebuild: module boundaries, code organization and runtime principles.
- `docs/phase-0/README.md`
  - Phase 0 reverse-engineering dossier and extracted notes.

## Stack

- Vite
- Plain JavaScript
- Three.js

## Current Architecture

- `src/core/Engine.js`
  - Owns the renderer, resize flow and render loop.
- `src/core/Router.js`
  - Minimal runtime router for `/` and `/portfolio/:project`.
- `src/controllers/SiteController.js`
  - The top-level orchestrator.
  - Mirrors the original production controller shape:
    - home sections
    - detail route
    - UI overlay
    - scroll-driven section selection
- `src/scenes/`
  - `IglooScene`
  - `CubesScene`
  - `EntryScene`
  - `DetailScene`
  - `UIScene` (DOM overlay for now)
- `src/content/siteContent.js`
  - Reconstructed content layer.
- `src/content/assetManifest.js`
  - Original dump asset references, grouped by role.
- `public/decoders/`
  - Local Draco and Basis decoders copied from the production dump.
- `public/reference-assets/`
  - A curated subset of dumped `.drc`, `.ktx2` and `.exr` files used by the rebuilt scenes.

## Current Asset Pipeline

- `AssetRegistry` now preloads:
  - Draco geometry via `DRACOLoader`
  - KTX2 textures via `KTX2Loader`
  - EXR environment maps via `EXRLoader + PMREM`
- The reconstructed scenes now consume a real subset of the original dumped assets instead of placeholder primitives only.

## Why This Structure

The original site was a production bundle with a thin Svelte shell and a large runtime controller that managed:

- a WebGL runtime
- multiple section scenes
- a detail scene
- a UI layer
- route-driven scene switching

This repo starts by rebuilding that runtime shape first, then the real assets and shaders can be migrated into stable modules instead of staying trapped inside a single minified bundle.

## Next Reverse Steps

1. Extract the real `Be` data block and replace the temporary content model.
2. Rebuild the original scroll choreography and section cross-fades from the production controller.
3. Split the DOM HUD into a real WebGL UI scene if visual parity is the goal.
4. Reintroduce audio routing and ambient layering.
5. Start replacing the current standard materials with shader-driven materials from the bundle.
