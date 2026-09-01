import { useEffect, useRef } from 'react';
import { COLOR, RADIUS, TYPE } from '../design/tokens';
import { tintFor } from '../catalog/colors';
import { recolorLeaf, useRender } from '../render/recolor';
import type { Leaf } from '../catalog/types';
import { T, tr } from '../i18n/strings';
import { useKiosk } from '../store/useKiosk';
import { Ornament } from '../ui/Ornament';
import { PrimaryButton, StepHeader, TopBar } from '../ui/controls';
import { WallStage } from '../ui/WallStage';

/**
 * Step 2 — the door.
 *
 * The carousel's CENTRE slot is the selection: whatever sits under the middle is
 * the door standing in the room. Sliding picks it — there is nothing to tap.
 * That is the whole interaction, and it is why the room can stay put while the
 * door changes under it: the salesperson runs a thumb along the strip and the
 * doorway keeps filling with a different door.
 *
 * Paint comes AFTER the model now, not before: a colour is something a
 * specific door is sold in, not a universal swatch, so every tile here shows
 * its leaf as photographed (or in whatever paint is already picked, if the
 * customer came back to change models) rather than a colour this door may
 * not even offer.
 */
export function DoorStep() {
  const lang = useKiosk((s) => s.lang);
  const leafId = useKiosk((s) => s.leafId);
  const LEAVES = useKiosk((s) => s.leaves);
  const setLeaf = useKiosk((s) => s.setLeaf);
  const stepLeaf = useKiosk((s) => s.stepLeaf);
  const cycleLang = useKiosk((s) => s.cycleLang);
  const back = useKiosk((s) => s.back);
  const next = useKiosk((s) => s.next);

  const track = useRef<HTMLDivElement>(null);
  const settle = useRef<number | undefined>(undefined);
  /** True while the user is dragging, so the centre-follows-selection effect
   *  does not fight the finger mid-scroll. */
  const dragging = useRef(false);
  /** True while WE are scrolling, so the centre-picker does not read a
   *  half-finished smooth scroll and "correct" the choice to a neighbour —
   *  which used to hand you the door next to the one you tapped. */
  const programmatic = useRef(false);

  const pickCentred = () => {
    const el = track.current;
    if (!el) return;
    const centre = el.scrollLeft + el.clientWidth / 2;
    let best = 0;
    let bestDist = Infinity;
    Array.from(el.children).forEach((child, i) => {
      const c = child as HTMLElement;
      const d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - centre);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    const id = LEAVES[best]?.id;
    if (id && id !== leafId) setLeaf(id);
  };

  const onScroll = () => {
    dragging.current = true;
    window.clearTimeout(settle.current);
    settle.current = window.setTimeout(() => {
      dragging.current = false;
      if (programmatic.current) { programmatic.current = false; return; }
      pickCentred();
    }, 140);
  };

  // When the door changes from elsewhere — a swipe on the room — bring that
  // tile to the centre so the strip and the stage stay in agreement.
  useEffect(() => {
    if (dragging.current) return;
    const el = track.current;
    if (!el) return;
    const i = LEAVES.findIndex((l) => l.id === leafId);
    const child = el.children[i] as HTMLElement | undefined;
    if (!child) return;
    const target = child.offsetLeft + child.offsetWidth / 2 - el.clientWidth / 2;
    if (Math.abs(el.scrollLeft - target) > 4) {
      programmatic.current = true;
      el.scrollTo({ left: target, behavior: 'smooth' });
    }
  }, [leafId]);

  return (
    <div className="dc-screen" style={{ animation: 'fadeUp .5s cubic-bezier(.22,.61,.36,1) both' }}>
      <WallStage onSwipe={stepLeaf}>
        <div style={{ position: 'absolute', top: 22, left: 22, right: 22 }}>
          <TopBar onBack={back} backLabel={tr(T.back, lang)} lang={lang} onCycleLang={cycleLang} floating />
        </div>
      </WallStage>

      <div className="dc-panel" style={{ background: COLOR.paper, padding: 'clamp(24px, 3vw, 40px)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
          <StepHeader kicker={tr(T.step, lang)} step="02 / 04" title={tr(T.step2, lang)} />
          <div style={{ ...TYPE.small, color: COLOR.inkSoft, textAlign: 'right' }}>{tr(T.swipehint, lang)}</div>
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ position: 'relative', margin: '0 -8px' }}>
          <div
            ref={track}
            className="scr dc-track"
            onScroll={onScroll}
            style={{
              display: 'flex',
              gap: 14,
              overflowX: 'auto',
              scrollSnapType: 'x mandatory',
              // A fixed tile width, not a percentage: a percentage basis
              // resolves against the CONTENT box, which the centring padding
              // has already shrunk to a sliver.
              ['--tile' as string]: 'clamp(112px, 11vw, 178px)',
              padding: '10px calc(50% - var(--tile) / 2)',
            }}
          >
            {LEAVES.map((l) => {
              const selected = l.id === leafId;
              return (
                <button
                  key={l.id}
                  onClick={() => setLeaf(l.id)}
                  style={{
                    flex: '0 0 var(--tile)',
                    scrollSnapAlign: 'center',
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    transition: 'transform .3s cubic-bezier(.22,.61,.36,1), opacity .3s ease',
                    transform: selected ? 'scale(1)' : 'scale(.94)',
                    opacity: selected ? 1 : 0.55,
                  }}
                >
                  <div
                    style={{
                      position: 'relative',
                      width: '100%',
                      // A FIXED tile shape for every door — not each door's own
                      // aspect — so the strip is a row of equal boxes; each leaf
                      // sits inside whole and centred (`contain`), never stretched.
                      aspectRatio: '0.42',
                      borderRadius: RADIUS,
                      overflow: 'hidden',
                      background: COLOR.paper,
                      boxShadow: selected
                        ? `0 8px 22px rgba(35,32,27,.18), inset 0 0 0 1.5px ${COLOR.brass}`
                        : `inset 0 0 0 1px ${COLOR.line}`,
                    }}
                  >
                    {/* the very leaf the stage shows, wearing the chosen paint */}
                    <TileImage leaf={l} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10 }}>
                    {selected && <Ornament width={30} strokeWidth={3.4} />}
                    <span style={{ ...TYPE.small, color: selected ? COLOR.ink : COLOR.inkSoft }}>{tr(l.name, lang)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 12, borderTop: `1px solid ${COLOR.line}` }}>
          <PrimaryButton onClick={next}>
            {tr(T.next, lang)}
            <span style={{ fontSize: '1rem' }}>›</span>
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

/**
 * A carousel tile wearing the chosen paint, so the strip and the stage stay
 * one image. The recolour is cached by the engine; the photographed leaf
 * stands in for the few frames the first composite takes.
 */
function TileImage({ leaf }: { leaf: Leaf }) {
  const colorId = useKiosk((s) => s.colorId);
  const colors = useKiosk((s) => s.colors);
  const paint = tintFor(colorId, colors);
  const url = useRender(() => (paint ? recolorLeaf(leaf, paint) : Promise.resolve(leaf.image)), leaf.image, [leaf, colorId]);
  return <img src={url} alt="" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />;
}
