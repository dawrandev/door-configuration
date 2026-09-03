import { useKiosk } from './store/useKiosk';
import { AppShell } from './ui/AppShell';
import { Attract } from './screens/Attract';
import { RoomStep } from './screens/RoomStep';
import { ColorStep } from './screens/ColorStep';
import { DoorStep } from './screens/DoorStep';
import { TrimStep } from './screens/TrimStep';
import { Summary } from './screens/Summary';

const SCREENS = {
  attract: Attract,
  room: RoomStep,
  color: ColorStep,
  door: DoorStep,
  trim: TrimStep,
  summary: Summary,
} as const;

/**
 * The configurator runs on a staffed touch monitor in the showroom, not an
 * unattended kiosk. There is therefore NO idle timeout: a customer who is
 * thinking, or talking to the salesperson, keeps their door — nothing wipes the
 * screen out from under them. Starting over is a deliberate button, never a
 * timer.
 */
export default function App() {
  const screen = useKiosk((s) => s.screen);
  const Screen = SCREENS[screen];

  return (
    <div className="app-root" style={{ height: '100%' }}>
      <AppShell>
        <Screen />
      </AppShell>
    </div>
  );
}
