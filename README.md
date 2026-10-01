# TJ's Hero Lab

TJ's superhero mirror. Point the tablet at him: masks go on his face, powers come out of it, and a cape flies behind him. Snap a hero picture; it lands in his on-tablet gallery. Sibling of [Tori's Glam Studio](../tori-glam-studio).

## For a 4-year-old pre-reader
- **Pictures, not words.** Every tile is a live mini preview drawn on a cartoon head.
- **Everything talks.** Every tap is spoken by the same narrator as TJ's Hero Book (OpenAI `cedar`, `audio/*.mp3`). The tablet's built-in voice is the fallback.
- **Powers from his face, or from a tap.** Open your mouth → fire/ice breath. Surprised face → laser eyes. If he can't manage the face move, tapping the camera picture fires every power, and the narrator tells him so after 7 seconds.
- **Calm by design.** Quiet master volume, a soft camera flash (never a full white-out), and sounds that fade in and out.
- **One mask at a time, one breath at a time, one background at a time.**

## Gear
| Drawer | Items |
|---|---|
| Masks | Hero Mask, Robot Helmet, Thunder Helmet, Dino Hood |
| Powers | Fire Breath, Ice Breath, Laser Eyes, Power Glow |
| Gear | Cape (behind him), TJ Badge, Hero City, Space |

All original designs (no Marvel/DC look-alikes), so the app can be hosted publicly.

## How it works
- MediaPipe **Face Landmarker** (478 points + blendshapes) and **Selfie Segmenter** (body cut-out for the cape, glow and backgrounds). Vendored in `vendor/`, no CDN.
- Layering: backdrop → glow → cape → the cut-out person → badge, mask, powers.
- Photos are kept in IndexedDB on the tablet; nothing is uploaded.

## Run locally
```
python -m http.server 5227 --directory C:/Users/Terre/Code/tj-hero-lab
```
- `?demo&go` uses `test/face.jpg` instead of the camera. `&jaw=0.8` fakes an open mouth, `&brow=0.9` a surprised face, `&nocut` skips the body cut-out (debug).
- `node test/shoot.cjs [names]` renders headless screenshots into `test/shots/`.
- `node test/preview-face.cjs` regenerates `preview-face.json` (the landmarks behind the tile pictures).
- `node scripts/voice-gen.mjs` records any missing narrator lines from `lines.js` (delete an mp3 to redo it).

The camera needs HTTPS on Android, so the tablet needs the hosted copy.
