# Kiosk — the door configurator

A showroom configurator for a Karakalpak door workshop. A customer picks a room,
a door, optionally a nalichnik and korona design, and a colour, and sees the
result composited into a photograph of a real interior. It runs on a staffed
touch monitor beside a salesperson — not an unattended kiosk — which is why
there is no idle timeout and "start over" is a deliberate button.

React 19 + TypeScript + Vite + Zustand. No backend: the catalogue is compiled
into the bundle, and anything staff add at the bench lives in `localStorage`.

## Running it

```bash
npm install
npm run dev            # http://localhost:5173
```

| Command | What it does |
|---|---|
| `npm run dev` | dev server with HMR |
| `npm run build` | typecheck, then build to `dist/` |
| `npm run preview` | serve the built `dist/` |
| `npm test` | the unit suite (vitest) |
| `npm run lint` | oxlint, and it fails on any warning |
| `npm run smoke` | drive the built app in a real browser end to end |

`npm run smoke` needs a browser binary once: `npx playwright install chromium`.
Add `-- --shots _smoke` to write a screenshot per screen.

Append `?kiosk` to the URL to turn on showroom hardening — scrolling is locked
and the start button requests fullscreen. Without it the same build behaves as
an ordinary responsive web page, which is what a phone or a laptop should get.

## The two faces

Both live in one bundle behind hash routes, so the static build needs no server
to route it (`src/main.tsx`).

- `#/` — the customer configurator.
- `#/admin` — the workshop bench: add or re-cut doors, rooms and trim designs.
  There is a deliberately faint entry point in the bottom-right corner of every
  customer screen (`src/ui/AppShell.tsx`).

**The bench has no password.** Anyone who reaches the page can edit or delete
the catalogue. That is a known gap, not a decision.

## Where things are

```
src/
  render/recolor.ts    the recolour engine — the heart of this app
  catalog/             the compiled-in catalogue and its types
  store/useKiosk.ts    the customer journey, as one zustand store
  screens/             one file per step
  ui/WallStage.tsx     the room photo with a door composited into its doorway
  admin/               the bench: DoorBench, RoomBench, TrimBench
tools/                 the offline pipelines that generate the catalogue
```

### How the recolour works

A door is a photograph, not a 3D model. To repaint it, `src/render/recolor.ts`
separates what the light is doing from what the paint is doing, replaces the
paint, and puts the light back:

```
lighting = blur(L·α) / blur(α)
base     = L / lighting                      what is left is albedo
ao       = lighting / p98                    pure occlusion
spec     = max(0, L − lighting·1.28) · 0.55  highlights, kept white

out = tint · base · ao + spec
```

This is why a repainted door reads as painted steel rather than as a photograph
with a colour laid over it — a CSS `multiply` tints the highlights and
double-darkens the shading, which is the "dipped in plastic" look. It holds for
matte paint and breaks on gloss; every leaf in the set is matte.

The `'oq'` finish is special: it carries no tint, so the pipeline is skipped
entirely and the original photograph is displayed.

## Regenerating the catalogue

Two pipelines, both run by hand, both writing generated `.ts` files that are
committed. Neither runs at build time.

```bash
node tools/leaves.mjs        # raw-photos/ -> public/assets/leaves/ + leaves.generated.ts
node tools/rooms.mjs         # tools/room-sources/ -> public/assets/rooms/ + rooms.generated.ts
node tools/responsive.mjs <url> <outDir>   # screenshots at three device widths
```

`leaves.mjs` finds each door by the shadow gap between leaf and jamb, squares the
photograph up with a homography, strips the handle, and writes a WebP. It also
emits the handle cutout and `handles.generated.ts`.

`rooms.mjs` replaces each render's own doorway with an unlit recess, so a leaf
that misses its opening by a pixel shows dark — a shadow gap, which is real —
rather than the original door's bright white edge. That is what removed the halo
this project fought for a long time.

**Both are deterministic.** Re-running them should reproduce the committed
output byte for byte. If `aspect` or `corners` in `leaves.generated.ts` moves,
something in the toolchain has drifted and the doors are no longer the shape
they were measured to be — investigate before committing.

`tools/room-sources/` holds the four product renders `rooms.mjs` cuts rooms
from. They live under `tools/` and not under `public/` because they are pipeline
input: the app never serves them.

## Tests

The suite covers the parts that fail silently: the recolour maths, the
perspective solve, the trim geometry, the journey's navigation rules, and the
catalogue's merge and delete-vs-hide semantics.

Fixtures are built programmatically and never loaded from a real door image — a
suite pinned to `rosette.webp`'s bytes would go red for any asset change, which
is exactly when it is most needed.

## Known gaps

- The bench has no authentication.
- Everything the bench creates lives in one browser's `localStorage`, with a
  budget of a few megabytes and no export. Clearing site data loses it.
- No service worker, so a cold start still needs the server to be reachable.
