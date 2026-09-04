import { COLOR, RADIUS, TYPE } from '../design/tokens';
import { T, tr } from '../i18n/strings';
import { TRIM_DEFAULT } from '../catalog/colors';
import { useKiosk, stepLabel, useStepFlags } from '../store/useKiosk';
import { Eyebrow, PrimaryButton, TopBar } from '../ui/controls';
import { WallStage } from '../ui/WallStage';

/**
 * Step 3 — the door, in the room, at rest.
 *
 * No price and no order form. This runs beside a salesperson whose job is to
 * show doors; the money conversation is theirs to have, and a screen that asks
 * for a phone number in the middle of it gets in the way. What the screen owes
 * the customer here is a clean last look and the name of what they chose.
 */
export function Summary() {
  const lang = useKiosk((s) => s.lang);
  const roomId = useKiosk((s) => s.roomId);
  const leafId = useKiosk((s) => s.leafId);
  const leaves = useKiosk((s) => s.leaves);
  const rooms = useKiosk((s) => s.rooms);
  const trims = useKiosk((s) => s.trims);
  const nalichnikId = useKiosk((s) => s.nalichnikId);
  const koronaId = useKiosk((s) => s.koronaId);
  const cycleLang = useKiosk((s) => s.cycleLang);
  const back = useKiosk((s) => s.back);
  const reset = useKiosk((s) => s.reset);
  const stepFlags = useStepFlags();

  const room = rooms.find((r) => r.id === roomId) ?? rooms[0];
  const leaf = leaves.find((l) => l.id === leafId) ?? leaves[0];
  const nalichnikModel = nalichnikId !== TRIM_DEFAULT ? trims.find((t) => t.id === nalichnikId) : undefined;
  const koronaModel = koronaId !== TRIM_DEFAULT ? trims.find((t) => t.id === koronaId) : undefined;

  const rows = [
    { label: tr(T.wall, lang), value: tr(room.name, lang) },
    { label: tr(T.model, lang), value: tr(leaf.name, lang) },
    // Only shown when the customer actually picked an independent design —
    // TRIM_DEFAULT (or a stale/removed id) means the room's own trim is
    // showing, already implied by the room row above.
    ...(nalichnikModel ? [{ label: tr(T.nalichnik, lang), value: tr(nalichnikModel.name, lang) }] : []),
    ...(koronaModel ? [{ label: tr(T.korona, lang), value: tr(koronaModel.name, lang) }] : []),
  ];

  return (
    <div className="dc-screen" style={{ animation: 'fadeUp .5s cubic-bezier(.22,.61,.36,1) both' }}>
      <WallStage>
        <div style={{ position: 'absolute', top: 22, left: 22, right: 22 }}>
          <TopBar onBack={back} backLabel={tr(T.back, lang)} lang={lang} onCycleLang={cycleLang} floating />
        </div>
      </WallStage>

      <div className="dc-panel" style={{ background: COLOR.paper, padding: 'clamp(24px, 3vw, 40px)', minHeight: 0 }}>
        <Eyebrow>{tr(T.step, lang)} · {stepLabel('summary', stepFlags)}</Eyebrow>
        <h2 style={{ ...TYPE.h1, margin: '10px 0 0', color: COLOR.ink }}>{tr(T.sumt, lang)}</h2>

        <div className="scr" style={{ flex: 1, overflowY: 'auto', padding: '20px 0', minHeight: 80 }}>
          {rows.map((r) => (
            <div
              key={r.label}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 16,
                padding: '15px 0',
                borderBottom: `1px solid ${COLOR.line}`,
              }}
            >
              <span style={{ ...TYPE.label, color: COLOR.inkSoft, whiteSpace: 'nowrap' }}>{r.label}</span>
              <span style={{ ...TYPE.data, color: COLOR.ink, textAlign: 'right' }}>{r.value}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 14, paddingTop: 6 }}>
          <button
            onClick={reset}
            style={{
              flex: 1,
              minHeight: 54,
              background: 'transparent',
              border: `1px solid ${COLOR.lineStrong}`,
              borderRadius: RADIUS,
              ...TYPE.small,
              color: COLOR.ink,
              cursor: 'pointer',
            }}
          >
            {tr(T.startover, lang)}
          </button>
          <PrimaryButton onClick={back} style={{ flex: 2 }}>
            {tr(T.back, lang)}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
