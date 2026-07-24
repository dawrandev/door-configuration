import type { CSSProperties, ReactNode } from 'react';
import { DESIGN_WIDTH } from '../design/tokens';
import { useElementSize } from './useElementSize';

/**
 * Sets `--u` for everything inside it: one design px in real px, derived from
 * the region's own measured width.
 *
 * `u = width / base`, so content authored against `base` design-px fills the
 * region exactly. The clamp is the important part — without a floor, a 1080-wide
 * design dropped into a 380px phone would render 25px labels at 9px; without a
 * cap, a wide monitor would render them at 40px. The floor and cap hold type in
 * a legible band while everything in between scales smoothly.
 *
 * Regions nest: the stage and the panel each measure themselves, so a control in
 * a 700px desktop sidebar and the same control in a full-width phone column both
 * come out at a comfortable size, from the one authored number.
 */
export function Region({
  base = DESIGN_WIDTH,
  // Type now lives in a fixed rem scale (see TYPE); `--u` only paces a little
  // spacing, so it is held deliberately low — the balloon-on-desktop era is over.
  minU = 0.42,
  maxU = 0.6,
  as: Tag = 'div',
  className,
  style,
  children,
  ...rest
}: {
  base?: number;
  minU?: number;
  maxU?: number;
  as?: 'div' | 'section';
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
} & Record<string, unknown>) {
  const [ref, { width }] = useElementSize();
  // Before the first measurement width is 0; fall back to the cap so the very
  // first paint is full-size rather than collapsed to the floor.
  const u = width ? Math.min(maxU, Math.max(minU, width / base)) : maxU;

  return (
    <Tag
      ref={ref}
      className={className}
      style={{ ['--u' as string]: `${u}px`, ...style }}
      {...rest}
    >
      {children}
    </Tag>
  );
}
