# TJ's Hero Lab

TJ's superhero mirror. Point the tablet at him: real 3D helmets turn with his head, powers come out of his face, and the world behind him changes. Snap a hero picture; it lands in his on-tablet gallery. Sibling of [Tori's Glam Studio](../tori-glam-studio).

**Live:** https://atlspartan33.github.io/tj-hero-lab/

## For a 4-year-old pre-reader
- **Pictures, not words.** Every tile is a real render: 3D helmets drawn on a cartoon head, Looks filters run over a sample scene.
- **Everything talks.** Tyler, the Turbo TJ announcer (ElevenLabs), names every item. 67 lines live in `lines.js` and `audio/`.
- **Powers come from his face, or from a tap.** Open your mouth → breath powers. Surprised face → eye powers. Tapping the picture fires them too, pulses the shield, and boosts lightning.
- **Calm by design.** Quiet master volume, a soft camera flash, and no strobing.

## What's in it (48 items)
| Drawer | Items |
|---|---|
| Masks (16) | **3D:** Robot, Thunder, Race Helmet, Astronaut, Knight, Dragon, Viking, Crown, Mech Pilot, Samurai, Deep Diver, Fire Chief · **2D:** Hero Mask, Dino Hood, Ninja, Lion |
| Powers (12) | Fire, Ice, Rainbow, Bubbles, Super Shout (shockwave) · Laser Eyes, Hypno Eyes · Lightning, Power Glow, Shield, Super Speed (ghost trails), Invisible |
| Gear (14) | Cape, Wings, Jetpack (behind him) · Badge, Robot Buddy (3D, orbits his head), Dino Buddy · 8 worlds: Hero City, Space, Dino Land, Sky, Under the Sea, Snowy Peak, Race Track, Hero HQ |
| Looks (6) | Comic Book, Cartoon, Video Game, Night Vision, Heat Vision, Hologram |

All original designs (no Marvel/DC look-alikes), so the app can be hosted publicly.

## How it renders (`engine.js`)
1. **Composite shader:** camera or backdrop, then glow, speed ghosts, behind-gear, and the cut-out person (rim-lit to match the backdrop, optionally invisible), then front 2D gear. A shockwave and heat haze bend the whole picture.
2. **3D** (`helmets3d.js`): helmets are modeled in head space (1 unit = face width) and posed from the 478 landmarks every frame. An invisible head occluder hides the back of each helmet. Lighting is tinted toward the room's average color.
3. **GPU effects** (`fx3d.js`): particle systems, glowing ribbons (lasers, lightning, hypno rings) and the hex shield.
4. **Selective bloom:** only things on the BLOOM layer glow.
5. **Final pass:** bloom add, mirror flip (always last), Looks filters, ice frost.

A **quality governor** steps the effects down when frames slow (MSAA, bloom size, layer resolution, aura taps, segmentation rate) and back up when there's headroom. On GPUs without float render targets, glow is turned off and the rest runs.

## Run locally
```
python -m http.server 5228 --directory C:/Users/Terre/Code/tj-hero-lab
```
- `?demo&go` uses `test/face.jpg` instead of the camera (gitignored client asset). Flags: `&jaw=0.8` fakes an open mouth, `&brow=0.9` a surprised face, `&mirror` mirrors it, `&hq` pins top quality.
- `node test/v3.cjs [names]` renders every item headlessly to `test/shots/v3-*.png` (SwiftShader WebGL).
- `node test/ui3.cjs` measures the drawers at four screen sizes. `node test/snap3.cjs` checks photo capture.
- `node scripts/voice-gen.mjs` records any missing narrator lines (ElevenLabs, Tyler `GyIXYY876myKNtA1j8NI`).

## Release checklist
Bump `CACHE` in `sw.js` (`hero-vN`) on every publish, or installed tablets keep the old files.
