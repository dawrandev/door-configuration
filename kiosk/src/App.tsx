import { useEffect } from 'react';
import { useKiosk, startCatalogPolling } from './store/useKiosk';
import { AppShell } from './ui/AppShell';
import { COLOR, TYPE } from './design/tokens';
import { PrimaryButton } from './ui/controls';
import { Attract } from './screens/Attract';
import { RoomStep } from './screens/RoomStep';
import { ColorStep } from './screens/ColorStep';
import { DoorStep } from './screens/DoorStep';
import { NalichnikStep, KoronaStep } from './screens/TrimPickStep';
import { Summary } from './screens/Summary';

const SCREENS = {
  attract: Attract,
  room: RoomStep,
  color: ColorStep,
  door: DoorStep,
  nalichnik: NalichnikStep,
  korona: KoronaStep,
  summary: Summary,
} as const;

/** Centred single-message states — the catalogue is either still coming or
 *  did not come at all, and neither is a screen worth a layout of its own. */
function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ textAlign: 'center', maxWidth: 420 }}>{children}</div>
    </div>
  );
}

/**
 * The configurator runs on a staffed touch monitor in the showroom, not an
 * unattended kiosk. There is therefore NO idle timeout: a customer who is
 * thinking, or talking to the salesperson, keeps their door — nothing wipes the
 * screen out from under them. Starting over is a deliberate button, never a
 * timer.
 */
export default function App() {
  const screen = useKiosk((s) => s.screen);
  const status = useKiosk((s) => s.status);
  const error = useKiosk((s) => s.error);
  const refresh = useKiosk((s) => s.refresh);
  const empty = useKiosk((s) => s.rooms.length === 0 || s.leaves.length === 0);

  // The catalogue lives on the server now, so there is a moment before any
  // door exists — and a door published at the bench, possibly on another
  // machine, has to arrive without anyone reloading.
  useEffect(() => {
    void refresh();
    return startCatalogPolling();
  }, [refresh]);

  if (status === 'loading') {
    return (
      <AppShell>
        <Notice>
          <div style={{ ...TYPE.small, color: COLOR.inkSoft }}>Katalog yuklanmoqda…</div>
        </Notice>
      </AppShell>
    );
  }

  if (status === 'error') {
    return (
      <AppShell>
        <Notice>
          <div style={{ ...TYPE.h2, color: COLOR.ink, marginBottom: 10 }}>Katalogni o‘qib bo‘lmadi</div>
          <div style={{ ...TYPE.small, color: COLOR.inkSoft, marginBottom: 20 }}>{error}</div>
          <PrimaryButton onClick={() => void refresh()}>Qayta urinish</PrimaryButton>
        </Notice>
      </AppShell>
    );
  }

  // A catalogue with no room or no door cannot be walked at all — every
  // screen resolves one of each. Saying so beats letting the stage read
  // `rooms[0]` off an empty list.
  if (empty) {
    return (
      <AppShell>
        <Notice>
          <div style={{ ...TYPE.h2, color: COLOR.ink, marginBottom: 10 }}>Katalog bo‘sh</div>
          <div style={{ ...TYPE.small, color: COLOR.inkSoft }}>
            Ko‘rsatish uchun kamida bitta xona va bitta eshik kerak. Ustaxonada qo‘shing.
          </div>
        </Notice>
      </AppShell>
    );
  }

  const Screen = SCREENS[screen];
  return (
    <div className="app-root" style={{ height: '100%' }}>
      <AppShell>
        <Screen />
      </AppShell>
    </div>
  );
}
