import { useEffect, useRef } from 'react';
import { COLOR, RADIUS, TYPE } from '../design/tokens';
import { TRIM_DEFAULT } from '../catalog/colors';
import { T, tr } from '../i18n/strings';
import { useKiosk, stepLabel } from '../store/useKiosk';
import { Ornament } from '../ui/Ornament';
import { PrimaryButton, StepHeader, TopBar } from '../ui/controls';
import { WallStage } from '../ui/WallStage';

/**
 * Step 3 (only when at least one design is published) — the nalichnik/korona
 * DESIGN, independent of which room or door was chosen. A close structural
 * copy of DoorStep's carousel (same track/centring/tile chrome), with one
 * addition: a "Standart" tile that is always first and always present,
 * selecting TRIM_DEFAULT — today's behaviour (the door's own trim, or the
 * room's), unchanged for anyone who leaves it there.
 *
 * `WallStage` is used the same way ColorStep's is (no `onSwipe`) — the
 * screen right before colour, so there's no ambiguity with the door
 * carousel's own swipe gesture on the screen before this one.
 */
export function TrimStep() {
  const lang = useKiosk((s) => s.lang);
  const trimModelId = useKiosk((s) => s.trimModelId);
  const trims = useKiosk((s) => s.trims);
  const setTrimModel = useKiosk((s) => s.setTrimModel);
  const cycleLang = useKiosk((s) => s.cycleLang);
  const back = useKiosk((s) => s.back);
  const next = useKiosk((s) => s.next);

  const track = useRef<HTMLDivElement>(null);
  const settle = useRef<number | undefined>(undefined);
  const dragging = useRef(false);
  const programmatic = useRef(false);

  // "Standart" plus every published design — the same list order the
  // carousel's centring math indexes into.
  const items: { id: string; label: string; image: string | null }[] = [
    { id: TRIM_DEFAULT, label: tr(T.trimdefault, lang), image: null },
    ...trims.map((t) => ({ id: t.id, label: tr(t.name, lang), image: t.trimSource })),
  ];

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
    const id = items[best]?.id;
    if (id && id !== trimModelId) setTrimModel(id);
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

  useEffect(() => {
    if (dragging.current) return;
    const el = track.current;
    if (!el) return;
    const i = items.findIndex((it) => it.id === trimModelId);
    const child = el.children[i] as HTMLElement | undefined;
    if (!child) return;
    const target = child.offsetLeft + child.offsetWidth / 2 - el.clientWidth / 2;
    if (Math.abs(el.scrollLeft - target) > 4) {
      programmatic.current = true;
      el.scrollTo({ left: target, behavior: 'smooth' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimModelId]);

  return (
    <div className="dc-screen" style={{ animation: 'fadeUp .5s cubic-bezier(.22,.61,.36,1) both' }}>
      <WallStage>
        <div style={{ position: 'absolute', top: 22, left: 22, right: 22 }}>
          <TopBar onBack={back} backLabel={tr(T.back, lang)} lang={lang} onCycleLang={cycleLang} floating />
        </div>
      </WallStage>

      <div className="dc-panel" style={{ background: COLOR.paper, padding: 'clamp(24px, 3vw, 40px)' }}>
        <StepHeader kicker={tr(T.step, lang)} step={stepLabel('trim', true)} title={tr(T.steptrim, lang)} />

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
              ['--tile' as string]: 'clamp(112px, 11vw, 178px)',
              padding: '10px calc(50% - var(--tile) / 2)',
            }}
          >
            {items.map((it) => {
              const selected = it.id === trimModelId;
              return (
                <button
                  key={it.id}
                  onClick={() => setTrimModel(it.id)}
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
                      aspectRatio: '0.72',
                      borderRadius: RADIUS,
                      overflow: 'hidden',
                      background: COLOR.paper,
                      display: it.image ? undefined : 'flex',
                      alignItems: it.image ? undefined : 'center',
                      justifyContent: it.image ? undefined : 'center',
                      boxShadow: selected
                        ? `0 8px 22px rgba(35,32,27,.18), inset 0 0 0 1.5px ${COLOR.brass}`
                        : `inset 0 0 0 1px ${COLOR.line}`,
                    }}
                  >
                    {it.image ? (
                      <img src={it.image} alt="" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    ) : (
                      <span style={{ ...TYPE.small, color: COLOR.inkSoft, textAlign: 'center', padding: '0 8px' }}>{it.label}</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10 }}>
                    {selected && <Ornament width={30} strokeWidth={3.4} />}
                    <span style={{ ...TYPE.small, color: selected ? COLOR.ink : COLOR.inkSoft }}>{it.label}</span>
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
