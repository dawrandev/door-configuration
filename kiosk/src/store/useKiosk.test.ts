// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { stepLabel, useKiosk, type Screen } from './useKiosk';
import type { Leaf, TrimModel } from '../catalog/types';
import { DEFAULT_COLOR, TRIM_DEFAULT, TRIM_SAME } from '../catalog/colors';

/**
 * The showroom journey, pinned.
 *
 * State is injected with `setState` rather than assembled from the real
 * catalogue, so these assertions describe the RULES and not whichever four
 * doors happen to be in the bundle this week. The rules are the part that has
 * to survive the move to a server: the same store will be seeded from a fetched
 * snapshot instead of from localStorage, and the navigation must not change.
 */

const leaf = (id: string, colorIds?: string[]): Leaf => ({
  id,
  name: { uz: id, kk: id, ru: id },
  image: `/assets/leaves/${id}.webp`,
  aspect: 0.4,
  handleSide: 'left',
  handleSwappable: false,
  colorIds,
});

const trim = (id: string, category: 'nalichnik' | 'korona'): TrimModel => ({
  id, name: { uz: id, kk: id, ru: id }, category,
  trimMargin: { left: 0, right: 0, top: 0, bottom: 0 }, trimBoxes: [], trimSource: `/t/${id}.webp`,
});

const NALICHNIK = trim('n1', 'nalichnik');
const KORONA = trim('k1', 'korona');

beforeEach(() => {
  useKiosk.setState({
    screen: 'attract',
    colorId: DEFAULT_COLOR,
    trimColorId: TRIM_SAME,
    nalichnikId: TRIM_DEFAULT,
    koronaId: TRIM_DEFAULT,
    trims: [],
    leaves: [leaf('a'), leaf('b'), leaf('c')],
    leafId: 'a',
  });
});

/** Walk `next()` from the attract screen and collect where it lands. */
function forwardPath(): Screen[] {
  const path: Screen[] = [];
  for (let i = 0; i < 10; i++) {
    const before = useKiosk.getState().screen;
    useKiosk.getState().next();
    const after = useKiosk.getState().screen;
    if (after === before) break;
    path.push(after);
  }
  return path;
}

describe('navigation', () => {
  /**
   * The four-step flow, unchanged from before nalichnik and korona existed.
   * With neither catalogue published there is nothing to choose on either
   * step, so a single `next()` has to fall through TWO screens in a row —
   * which is why `walk` loops instead of taking one step.
   */
  it('skips both trim steps when neither catalogue has anything published', () => {
    expect(forwardPath()).toEqual(['room', 'door', 'color', 'summary']);
  });

  it('shows only the nalichnik step when only nalichniks are published', () => {
    useKiosk.setState({ trims: [NALICHNIK] });
    expect(forwardPath()).toEqual(['room', 'door', 'nalichnik', 'color', 'summary']);
  });

  it('shows only the korona step when only koronas are published', () => {
    useKiosk.setState({ trims: [KORONA] });
    expect(forwardPath()).toEqual(['room', 'door', 'korona', 'color', 'summary']);
  });

  it('shows both trim steps when both catalogues have entries', () => {
    useKiosk.setState({ trims: [NALICHNIK, KORONA] });
    expect(forwardPath()).toEqual(['room', 'door', 'nalichnik', 'korona', 'color', 'summary']);
  });

  /** Back has to mirror the same fall-through, or a customer who reaches
   *  colour cannot get back to the door. */
  it('mirrors the double fall-through going backwards', () => {
    useKiosk.setState({ screen: 'color' });
    useKiosk.getState().back();
    expect(useKiosk.getState().screen).toBe('door');
  });

  it('stops rather than wrapping at either end', () => {
    useKiosk.setState({ screen: 'attract' });
    useKiosk.getState().back();
    expect(useKiosk.getState().screen).toBe('attract');

    useKiosk.setState({ screen: 'summary' });
    useKiosk.getState().next();
    expect(useKiosk.getState().screen).toBe('summary');
  });
});

describe('stepLabel', () => {
  /** The counter on screen must agree with the flow above in every
   *  combination — a "03 / 04" on a five-step journey is a bug a customer
   *  can see. */
  it('numbers the four-step flow when no trim is published', () => {
    const o = { hasNalichnik: false, hasKorona: false };
    expect(stepLabel('room', o)).toBe('01 / 04');
    expect(stepLabel('door', o)).toBe('02 / 04');
    expect(stepLabel('color', o)).toBe('03 / 04');
    expect(stepLabel('summary', o)).toBe('04 / 04');
  });

  it('numbers five steps when one trim catalogue is published', () => {
    expect(stepLabel('nalichnik', { hasNalichnik: true, hasKorona: false })).toBe('03 / 05');
    expect(stepLabel('color', { hasNalichnik: true, hasKorona: false })).toBe('04 / 05');
    expect(stepLabel('korona', { hasNalichnik: false, hasKorona: true })).toBe('03 / 05');
  });

  it('numbers six steps when both are published', () => {
    const o = { hasNalichnik: true, hasKorona: true };
    expect(stepLabel('nalichnik', o)).toBe('03 / 06');
    expect(stepLabel('korona', o)).toBe('04 / 06');
    expect(stepLabel('summary', o)).toBe('06 / 06');
  });
});

describe('colour validity across a door change', () => {
  /**
   * A colour is a paint a specific model is sold in, not a universal swatch.
   * Picking a paint, going back, and choosing a model that is not sold in it
   * must fall back to 'oq' rather than silently showing an unofficial finish.
   */
  it("falls back to 'oq' when the new door is not sold in the current colour", () => {
    useKiosk.setState({ leaves: [leaf('a', ['kok']), leaf('b', ['krem'])], leafId: 'a', colorId: 'kok' });
    useKiosk.getState().setLeaf('b');
    expect(useKiosk.getState().colorId).toBe(DEFAULT_COLOR);
  });

  it('keeps the colour when the new door is sold in it too', () => {
    useKiosk.setState({ leaves: [leaf('a', ['kok']), leaf('b', ['kok', 'krem'])], leafId: 'a', colorId: 'kok' });
    useKiosk.getState().setLeaf('b');
    expect(useKiosk.getState().colorId).toBe('kok');
  });

  /** An absent `colorIds` means "no restriction" — the default every door had
   *  before a product needed its own list. */
  it('treats a door with no colour list as selling every colour', () => {
    useKiosk.setState({ leaves: [leaf('a', ['kok']), leaf('b')], leafId: 'a', colorId: 'kok' });
    useKiosk.getState().setLeaf('b');
    expect(useKiosk.getState().colorId).toBe('kok');
  });

  /** 'oq' is the door as photographed, not a paint — no list restricts it. */
  it("never restricts 'oq', even on a door with a narrow colour list", () => {
    useKiosk.setState({ leaves: [leaf('a'), leaf('b', ['kok'])], leafId: 'a', colorId: DEFAULT_COLOR });
    useKiosk.getState().setLeaf('b');
    expect(useKiosk.getState().colorId).toBe(DEFAULT_COLOR);
  });
});

describe('stepLeaf', () => {
  it('wraps forwards off the end of the list', () => {
    useKiosk.setState({ leafId: 'c' });
    useKiosk.getState().stepLeaf(1);
    expect(useKiosk.getState().leafId).toBe('a');
  });

  it('wraps backwards off the front of the list', () => {
    useKiosk.setState({ leafId: 'a' });
    useKiosk.getState().stepLeaf(-1);
    expect(useKiosk.getState().leafId).toBe('c');
  });

  /** Swiping also changes the model, so it owes the same colour check
   *  `setLeaf` does — otherwise a swipe is a back door around it. */
  it('re-checks the colour against the door it lands on', () => {
    useKiosk.setState({ leaves: [leaf('a', ['kok']), leaf('b', ['krem'])], leafId: 'a', colorId: 'kok' });
    useKiosk.getState().stepLeaf(1);
    expect(useKiosk.getState().leafId).toBe('b');
    expect(useKiosk.getState().colorId).toBe(DEFAULT_COLOR);
  });
});

describe('reset', () => {
  /** "Start over" is a deliberate button on a staffed monitor, never a timer —
   *  but when it is pressed it must clear every axis, not just the screen. */
  it('clears every choice and returns to the attract screen', () => {
    useKiosk.setState({
      screen: 'summary', colorId: 'kok', trimColorId: 'krem',
      nalichnikId: 'n1', koronaId: 'k1', lang: 'ru',
    });
    useKiosk.getState().reset();
    const s = useKiosk.getState();
    expect(s.screen).toBe('attract');
    expect(s.colorId).toBe(DEFAULT_COLOR);
    expect(s.trimColorId).toBe(TRIM_SAME);
    expect(s.nalichnikId).toBe(TRIM_DEFAULT);
    expect(s.koronaId).toBe(TRIM_DEFAULT);
    expect(s.lang).toBe('uz');
  });
});

describe('language', () => {
  it('cycles uz → kk → ru → uz', () => {
    useKiosk.setState({ lang: 'uz' });
    const seen = [];
    for (let i = 0; i < 3; i++) {
      useKiosk.getState().cycleLang();
      seen.push(useKiosk.getState().lang);
    }
    expect(seen).toEqual(['kk', 'ru', 'uz']);
  });
});
