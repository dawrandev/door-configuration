import { COLOR, FONT, RADIUS, TYPE } from '../design/tokens';
import { LANG_NAME, LANGS, T, tr } from '../i18n/strings';
import { useKiosk } from '../store/useKiosk';
import { Ornament } from '../ui/Ornament';

/**
 * The attract screen: earn a walk-up (SPEC §8) and set the register — an atelier
 * that makes doors, stated in the customer's language. One serif line does the
 * talking; the ram's horn is the only ornament; everything else stays quiet.
 */
export function Attract() {
  const lang = useKiosk((s) => s.lang);
  const setLang = useKiosk((s) => s.setLang);
  const go = useKiosk((s) => s.go);

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(28px, 6vw, 72px)',
        position: 'relative',
        overflow: 'hidden',
        background: COLOR.studio,
        animation: 'fadeIn .8s cubic-bezier(.22,.61,.36,1) both',
      }}
    >
      {/* faint door-geometry watermark — the product's own hexagon lattice */}
      <svg
        viewBox="0 0 300 620"
        aria-hidden
        style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 'min(52vw, 460px)', opacity: 0.045, pointerEvents: 'none' }}
        fill="none"
        stroke={COLOR.ink}
        strokeWidth={3}
      >
        <rect x="30" y="20" width="240" height="580" rx="4" />
        <rect x="58" y="52" width="184" height="240" rx="3" />
        <rect x="58" y="320" width="184" height="248" rx="3" />
        <circle cx="228" cy="330" r="7" />
      </svg>

      <div style={{ position: 'relative', maxWidth: 720, textAlign: 'center' }}>
        <div style={{ ...TYPE.label, color: COLOR.brass }}>{tr(T.brandkicker, lang)}</div>

        <h1 style={{ ...TYPE.display, margin: '28px 0 0', color: COLOR.ink, textWrap: 'balance' }}>
          {tr(T.tagline, lang)}
        </h1>

        <div style={{ display: 'flex', alignItems: 'center', gap: 20, justifyContent: 'center', margin: '32px auto', width: 'min(90%, 420px)' }}>
          <div style={{ flex: 1, height: 1, background: COLOR.lineStrong }} />
          <Ornament width={72} />
          <div style={{ flex: 1, height: 1, background: COLOR.lineStrong }} />
        </div>

        <p style={{ ...TYPE.body, color: COLOR.inkSoft, maxWidth: 520, margin: '0 auto', textWrap: 'pretty' }}>
          {tr(T.sub, lang)}
        </p>

        <button
          onClick={() => go('room')}
          className="dc-lift"
          style={{
            marginTop: 40,
            minWidth: 260,
            minHeight: 60,
            padding: '0 40px',
            background: COLOR.ink,
            color: COLOR.onInk,
            border: 'none',
            borderRadius: RADIUS,
            fontFamily: FONT.display,
            fontSize: '1.2rem',
            letterSpacing: '-0.01em',
            cursor: 'pointer',
            boxShadow: '0 14px 34px rgba(35,32,27,.2)',
          }}
        >
          {tr(T.start, lang)}
        </button>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 44 }}>
          {LANGS.map((code) => {
            const selected = code === lang;
            return (
              <button
                key={code}
                onClick={() => setLang(code)}
                style={{
                  padding: '9px 18px',
                  background: selected ? 'rgba(35,32,27,.06)' : 'transparent',
                  border: 'none',
                  borderRadius: RADIUS,
                  ...TYPE.small,
                  color: selected ? COLOR.ink : COLOR.inkSoft,
                  cursor: 'pointer',
                  fontWeight: selected ? 500 : 400,
                }}
              >
                {LANG_NAME[code]}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
