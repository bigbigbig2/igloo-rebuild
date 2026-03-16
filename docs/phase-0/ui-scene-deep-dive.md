# `GF` / `QF` UI Scene Deep Dive

## Source of truth

- `../www.igloo.inc/assets/App3D-5907d20f.js:31804-31826`
  - Shared MSDF text mesh `Ui`
- `../www.igloo.inc/assets/App3D-5907d20f.js:42453-43140`
  - Scroll / sound / close widgets `FF`, `NF`, `OF`
- `../www.igloo.inc/assets/App3D-5907d20f.js:43636-43798`
  - Project detail panel `zF`, `QF`
- `../www.igloo.inc/assets/App3D-5907d20f.js:43799-43838`
  - UI scene root `GF`

## High-level conclusion

The original UI is not a DOM overlay with copied strings.

It is a dedicated orthographic WebGL scene that owns:

- logo
- scroll hint
- sound toggle
- close control
- project detail panel

All major text elements are MSDF text meshes, animated in shader, and driven by the same event bus as the 3D runtime.

## `Ui`: the shared text primitive

`Ui` is the base text mesh used across the site.

It:

- builds MSDF geometry with `zt.msdf(...)`
- creates its material after geometry is ready
- keeps `size` metadata from the generated geometry
- is reused by manifesto, cubes text, project detail panel, scroll hint, sound label, and close label

This is the shared primitive the rebuild currently does not have. As long as UI text stays in DOM, a large part of the original timing and rendering language cannot match.

## `GF`: root UI scene

`GF` extends an orthographic scene and creates:

- `logo`
- `scroll`
- `sound`
- `close`
- `projects`

It also:

- resizes all widgets using screen breakpoints from `Be`
- hides the scroll hint once the intro section is left
- updates project panel visibility every frame

So the original UI is a true runtime scene, not a passive overlay.

## Scroll widget `FF`

The scroll hint:

- uses `Ui` with `Be.scroll`
- waits for `webgl_show_ui_intro`
- reveals with staged `uShow1` / `uShow2` animation
- plays `ui-short` when hiding

This is small, but important. Even the simplest line of UI text is shader-driven and event-driven.

## Sound widget `NF`

The sound control is more than a button:

- text meshes for `Sound:`, `On`, and `Off`
- a separate datatexture icon mesh
- hover and click interaction
- event wiring to `webgl_audio_mute_toggle`
- visual state driven by audio controller mute state
- UI audio feedback on hover and toggle

The rebuild currently has no equivalent runtime path. This is why the top-right area still feels like a debug shell instead of the original interface.

## Close widget `OF`

The close control:

- uses a datatexture icon mesh plus MSDF text label
- only enables on `webgl_project_show`
- disables on `webgl_project_hide`
- emits `webgl_switch_scene` on click
- also binds `Escape`

So the original close button belongs to the WebGL UI scene and is synchronized with detail lifecycle, not route state in a DOM component.

## Project detail panel `QF` / `zF`

This is the original detail text panel system.

`QF`:

- owns one `zF` panel per project
- listens for `webgl_project_show` / `webgl_project_hide`
- forwards wheel / keyboard / touch input into the active panel's internal scroll

`zF`:

- builds the panel from `Be.cubes[index].interior`
- creates a sequence of text and link elements
- animates each block in with staggered timings
- computes its own internal scroll bounds
- lays out blocks in screen space on resize

This is a major architectural difference from the rebuild.

The original project panel scrolls inside the WebGL UI scene after detail opens. It is not the page scroll and it is not a DOM card.

## Event flow for project detail UI

Detail UI lifecycle in the original runtime:

1. Main controller opens detail route.
2. Detail 3D scene starts its reveal animation.
3. When `displayUIvar` reaches the right point, detail scene emits `webgl_project_show`.
4. `QF` shows the corresponding project panel.
5. `OF` enables close UI.
6. Wheel / keyboard / touch now scroll the active project panel internally.
7. On close, `webgl_project_hide` tears the panel back down.

This is why the original detail view feels synchronized: UI reveal is tied to 3D scene reveal, not simply "route became project".

## Why the rebuild still feels far from original

Current rebuild `UIScene` is intentionally a DOM HUD, but that means it skips the original behavior in several important ways:

- text is not MSDF / shader-driven
- reveal timing is not using the original `uShow1 / uShow2` pattern
- sound toggle and close are not native WebGL widgets
- project detail content is not an internally scrollable WebGL panel
- UI event flow is not the same event-bus contract as the original runtime

Even if the words are correct, the interface language is still different.

## Practical migration order

Recommended order:

1. Port the shared `Ui` text primitive.
2. Rebuild the static widgets first:
   - scroll
   - sound
   - close
3. Rebuild `QF` / `zF` project panel with internal scroll.
4. Replace DOM detail card only after the WebGL panel is stable.

## Minimum parity target

Before removing the DOM HUD, the WebGL UI layer should at least support:

- MSDF text primitive
- project show / hide event flow
- close control
- project panel internal scroll

That is the minimum set where the UI starts behaving like the original runtime instead of an external debug layer.
