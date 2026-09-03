import { COLOR, RADIUS, RADIUS_SM, TYPE } from '../design/tokens';
import { T, tr } from '../i18n/strings';
import { useKiosk, stepLabel } from '../store/useKiosk';
import { Ornament } from '../ui/Ornament';
import { PrimaryButton, StepHeader, TopBar } from '../ui/controls';

/**
 * Step 1 — the room.
 *
 * The customer picks the interior nearest their own, and it then stays put for
 * the rest of the session while doors change under it. That fixed backdrop is
 * what lets doors be compared at all: change both at once and there is nothing
 * to compare against.
 *
 * A browse screen, so it stays one centred column and lets the grid breathe.
 */
export function RoomStep() {
  const lang = useKiosk((s) => s.lang);
  const roomId = useKiosk((s) => s.roomId);
  const ROOMS = useKiosk((s) => s.rooms);
  const hasTrim = useKiosk((s) => s.trims.length > 0);
  const setRoom = useKiosk((s) => s.setRoom);
  const cycleLang = useKiosk((s) => s.cycleLang);
  const back = useKiosk((s) => s.back);
  const next = useKiosk((s) => s.next);

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', maxWidth: 1180, margin: '0 auto', width: '100%', animation: 'fadeUp .5s cubic-bezier(.22,.61,.36,1) both' }}>
      <div style={{ padding: 'clamp(20px, 3vw, 32px) clamp(24px, 4vw, 56px) 0' }}>
        <TopBar onBack={back} backLabel={tr(T.back, lang)} lang={lang} onCycleLang={cycleLang} />
      </div>

      <div style={{ padding: 'clamp(24px, 3vw, 36px) clamp(24px, 4vw, 56px) 0' }}>
        <StepHeader kicker={tr(T.step, lang)} step={stepLabel('room', hasTrim)} title={tr(T.step1, lang)} />
      </div>

      <div className="scr" style={{ flex: 1, overflowY: 'auto', padding: 'clamp(24px, 3vw, 34px) clamp(24px, 4vw, 56px) 140px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: 22 }}>
          {ROOMS.map((r) => {
            const selected = r.id === roomId;
            return (
              <button
                key={r.id}
                onClick={() => setRoom(r.id)}
                className="dc-lift"
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderRadius: RADIUS,
                  padding: 8,
                  cursor: 'pointer',
                  boxShadow: selected ? `inset 0 0 0 1.5px ${COLOR.brass}` : `inset 0 0 0 1px ${COLOR.line}`,
                }}
              >
                <div
                  style={{
                    width: '100%',
                    aspectRatio: '0.78',
                    borderRadius: RADIUS_SM,
                    background: `#ddd6c8 url(${r.thumb ?? r.image}) center 28%/cover`,
                    boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.08)',
                  }}
                />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
                  <span style={{ ...TYPE.small, color: COLOR.ink }}>{tr(r.name, lang)}</span>
                  {selected && <Ornament width={40} strokeWidth={3} />}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div
        style={{
          position: 'sticky',
          bottom: 0,
          padding: 'clamp(18px, 2vw, 26px) clamp(24px, 4vw, 56px)',
          background: `linear-gradient(180deg, transparent, ${COLOR.paper} 34%)`,
          display: 'flex',
          justifyContent: 'flex-end',
        }}
      >
        <PrimaryButton onClick={next}>
          {tr(T.next, lang)}
          <span style={{ fontSize: '1rem' }}>›</span>
        </PrimaryButton>
      </div>
    </div>
  );
}
