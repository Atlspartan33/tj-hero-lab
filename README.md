# TJ's Hero Lab

TJ's superhero mirror. Point the camera at him: sculpted 3D helmets turn with his head, paint wraps onto his face, powers come out of his face and his hands, and the world behind him changes. Two heroes can dress up differently and combo their powers. Snap a hero picture; it lands in the on-device gallery. Sibling of [Tori's Glam Studio](../tori-glam-studio).

**Live:** https://atlspartan33.github.io/tj-hero-lab/ (v4; v5 below runs locally until published)

## For a 4-year-old pre-reader
- **Pictures, not words.** Every tile is a real render: 3D helmets and face paint drawn on a cartoon head, Looks filters run over a sample scene.
- **Everything talks.** Tyler, the Turbo TJ announcer (ElevenLabs), names every item. 85 lines live in `lines.js` and `audio/`.
- **Three moves run everything.** Open your mouth → breath powers. Surprised face → eye powers. Show a hand, make a fist, or flick → hand powers. Tapping the picture fires them all too.
- **Calm by design.** Quiet master volume, a soft camera flash, no strobing (lightning re-shapes ~6×/s, never per frame), and bursts are capped so they never white out the screen.

## What's in it (60 items)
| Drawer | Items |
|---|---|
| Masks (22) | **Face paint (wraps the face mesh):** Tiger, Chrome, Galaxy, Lava, Circuits, Frost · **Sculpted 3D:** Robot, Thunder, Race Helmet, Astronaut, Knight, Dragon, Viking, Crown, Mech Pilot, Samurai, Deep Diver, Fire Chief · **2D:** Hero Mask, Dino Hood, Ninja, Lion |
| Powers (18) | **Hands:** Energy Blast (fist charges, open hand fires), Fireball (flick to throw), Zap Hands (lightning between fingers; point up for a bolt), Ice Hands, Magic Finger (draw rainbows in the air) · Fire, Ice, Rainbow, Bubbles, Super Shout · Laser Eyes, Hypno Eyes · Lightning, Power Glow, Shield, Super Speed, Invisible · **Star Storm** (WebGPU only) |
| Gear (14) | Cape, Wings, Jetpack · Badge, Robot Buddy, Dino Buddy · 8 worlds |
| Looks (6) | Comic Book, Cartoon, Video Game, Night Vision, Heat Vision, Hologram |

**Two heroes.** When two faces are on camera, a **1 / 2** switch appears above the drawers; each hero picks their own masks, paint, powers and gear (worlds and Looks are shared). Hero 1 is whoever is on the left of the screen; a numbered badge floats over each head. Both firing a power at once → **TEAM POWER** (lightning between them, a burst, a shockwave). Two heroes' open hands meeting → **HIGH FIVE**.

All original designs (no Marvel/DC look-alikes), so the app can be hosted publicly.

## How it renders
1. **Composite shader** (`engine.js`): camera or backdrop, glow, speed ghosts, behind-gear, the cut-out person (rim-lit, optionally invisible), front 2D gear; shockwave and heat haze bend the picture. Glow / invisible / speed are per hero: the picture is split between the two people.
2. **Face paint** (`facepaint.js`): MediaPipe's canonical face mesh (468 landmarks, its UV layout, 898 triangles; `facegeo.json` from `scripts/build-facegeo.mjs`) driven by the live landmarks. Paint is relit by the real skin under it and fades where the face turns away; glowing parts (magma, stars, circuit light) feed the bloom on their own.
3. **3D** (`helmets3d.js`): sculpted helmets from Blender (`models/helmets/<id>.glb`; sources + per-helmet build scripts in `models/helmets/src/`), posed in head space (1 unit = face width) from the landmarks. Object/material name prefixes drive the look (`glow_`, `blink_`, `pulse_`, `sway_`, `spin_`, `glass_`; `paint_`, `metal_`, `chrome_`, `gold_`…). A missing GLB falls back to the code-built helmet.
4. **WebGPU particles** (`gpufx.js`): up to 131k particles simulated and drawn by compute/render shaders into an offscreen canvas, which the WebGL engine picks up as a texture (so it gets bloom, the mirror and Looks). Curl-noise flow; hands push particles; palms pull energy in; the Star Storm rides three tilted rings whose far side passes behind the hero via the cut-out. No WebGPU → these extras switch off and the rest runs.
5. **CPU effects** (`fx3d.js`, `play.js`): particles, glowing ribbons (lasers, lightning, magic trails), the hex shield, fireballs, big comic words.
6. **Selective bloom**, then the **final pass**: bloom add, mirror flip (always last), Looks, frost, screen shake.

**Tracking:** the face model runs on the main thread every camera frame; the body cut-out and the hand model (`vendor/gesture_recognizer.task`) run in `tracker-worker.js` in parallel (falls back to the main thread, taking turns, if the worker can't start). `hands.js` turns landmarks into open / fist / charge / blast / throw.

A **quality governor** steps the effects down when frames slow and back up when there's headroom.

## Run locally
```
python scripts/serve.py 5228
```
(no-cache dev server). Camera works on `localhost` in Chrome.
- `?demo&go` uses `test/face.jpg` instead of the camera (gitignored client asset). Flags: `&jaw=0.8` open mouth, `&brow=0.9` surprised, `&mirror`, `&hq` pins top quality, `&two` shows the face twice (two heroes), `&img=test/pointing_up.jpg` another photo, `&hand=open|fist|blast|point|wave` fakes a hand, `&nogpu` skips WebGPU, `&noworker` keeps tracking on the main thread.
- `node test/v4.cjs [names]` screenshots every v5 feature on the real GPU (`test/shots/v4-*.png`); `test/helmets4.cjs` all helmets in one grid; `test/handreal.cjs` real hand detection on MediaPipe's sample photos; `test/perf4.cjs` frame time per feature set.
- `node test/v3.cjs [names]` renders the v3 items (SwiftShader WebGL).
- `node scripts/voice-gen.mjs` records any missing narrator lines (ElevenLabs, Tyler `GyIXYY876myKNtA1j8NI`).

## Release checklist
Bump `CACHE` in `sw.js` (`hero-vN`, now v6) on every publish, or installed tablets keep the old files. New files must be added to `SHELL` in `sw.js` too.
