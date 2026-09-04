import { COLOR, TYPE } from '../design/tokens';
import { TRIM_SAME } from '../catalog/colors';
import { T, tr } from '../i18n/strings';
import { useKiosk, stepLabel, useStepFlags } from '../store/useKiosk';
import { Ornament } from '../ui/Ornament';
import { PrimaryButton, StepHeader, TopBar } from '../ui/controls';
import { WallStage } from '../ui/WallStage';

/**
 * Step 3 — the paint, and independently, the nalichnik's paint.
 *
 * Colour comes AFTER the door now: a colour is something a specific model is
 * sold in, not a universal swatch, so the swatches here are the CHOSEN
 * leaf's own list (`leaf.colorIds`, or every registered colour when a leaf
 * doesn't restrict it) — never the full registry regardless of model.
 *
 * The nalichnik gets its own row on this same screen, not a buried override
 * on a later one: a customer can leave it following the door (the usual,
 * sensible default) or pick a different paint for it just as directly as
 * for the door itself. Its swatches are NOT leaf-filtered — trim is a
 * shared material, not a per-door product.
 */
export function ColorStep() {
  const lang = useKiosk((s) => s.lang);
  const leafId = useKiosk((s) => s.leafId);
  const leaves = useKiosk((s) => s.leaves);
  const colors = useKiosk((s) => s.colors);
  const colorId = useKiosk((s) => s.colorId);
  const trimColorId = useKiosk((s) => s.trimColorId);
  const stepFlags = useStepFlags();
  const setColor = useKiosk((s) => s.setColor);
  const setTrimColor = useKiosk((s) => s.setTrimColor);
  const cycleLang = useKiosk((s) => s.cycleLang);
  const back = useKiosk((s) => s.back);
  const next = useKiosk((s) => s.next);

  const leaf = leaves.find((l) => l.id === leafId);
  const doorColors = colors.filter((c) => c.id === 'oq' || !leaf?.colorIds || leaf.colorIds.includes(c.id));

  return (
    <div className="dc-screen" style={{ animation: 'fadeUp .5s cubic-bezier(.22,.61,.36,1) both' }}>
      <WallStage>
        <div style={{ position: 'absolute', top: 22, left: 22, right: 22 }}>
          <TopBar onBack={back} backLabel={tr(T.back, lang)} lang={lang} onCycleLang={cycleLang} floating />
        </div>
      </WallStage>

      <div className="dc-panel" style={{ background: COLOR.paper, padding: 'clamp(24px, 3vw, 40px)' }}>
        <StepHeader kicker={tr(T.step, lang)} step={stepLabel('color', stepFlags)} title={tr(T.step2c, lang)} />

        <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'clamp(14px, 2vw, 24px)', width: '100%' }}>
            {doorColors.map((c) => {
              const selected = c.id === colorId;
              return (
                <button
                  key={c.id}
                  onClick={() => setColor(c.id)}
                  className="dc-lift"
                  style={{ background: 'transparent', border: 'none', padding: 4, cursor: 'pointer' }}
                >
                  <div
                    style={{
                      width: '100%',
                      aspectRatio: '1',
                      borderRadius: '50%',
                      background: c.hex,
                      boxShadow: selected
                        ? `0 10px 24px rgba(35,32,27,.22), inset 0 0 0 2px ${COLOR.paper}, inset 0 0 0 4px ${COLOR.brass}`
                        : `inset 0 0 0 1px ${COLOR.lineStrong}`,
                      transition: 'box-shadow .25s ease',
                    }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10 }}>
                    {selected && <Ornament width={22} strokeWidth={3.4} />}
                    <span style={{ ...TYPE.small, fontSize: '0.82rem', color: selected ? COLOR.ink : COLOR.inkSoft }}>{tr(c.name, lang)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* The nalichnik — a fully independent choice, right here, not an
            override tucked onto a later step. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
          <span style={{ ...TYPE.label, color: COLOR.inkSoft, whiteSpace: 'nowrap' }}>{tr(T.trim, lang)}</span>
          <div className="scr" style={{ display: 'flex', alignItems: 'center', gap: 8, overflowX: 'auto', padding: '4px 0' }}>
            <button
              onClick={() => setTrimColor(TRIM_SAME)}
              style={{
                minHeight: 34,
                padding: '0 14px',
                borderRadius: 999,
                border: `1px solid ${trimColorId === TRIM_SAME ? COLOR.brass : COLOR.lineStrong}`,
                background: trimColorId === TRIM_SAME ? 'rgba(143,113,69,.1)' : 'transparent',
                ...TYPE.small,
                fontSize: '0.8rem',
                color: COLOR.ink,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {tr(T.trimsame, lang)}
            </button>
            {colors.map((c) => (
              <button
                key={c.id}
                onClick={() => setTrimColor(c.id)}
                title={tr(c.name, lang)}
                style={{
                  flex: '0 0 auto',
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  background: c.hex,
                  border: 'none',
                  boxShadow: trimColorId === c.id ? `inset 0 0 0 2px ${COLOR.paper}, inset 0 0 0 4px ${COLOR.brass}` : `inset 0 0 0 1px ${COLOR.lineStrong}`,
                  cursor: 'pointer',
                }}
              />
            ))}
          </div>
        </div>

        <div style={{ ...TYPE.small, color: COLOR.inkSoft, margin: '14px 0', lineHeight: 1.5 }}>{tr(T.colornote, lang)}</div>

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
