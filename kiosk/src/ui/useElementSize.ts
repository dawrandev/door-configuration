import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Measures an element and re-renders when it changes size.
 *
 * The whole responsive system is built on this: every region reports its real
 * pixel width, and the fluid unit `--u` is derived from it (see Region). One
 * ResizeObserver per region is cheap, and it means the layout answers to the
 * element's actual box — column, sidebar, whatever it reflowed into — rather
 * than to the viewport, which is the wrong number the moment there are two
 * columns of different widths.
 */
export function useElementSize<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const box = entry.contentRect;
      setSize((prev) =>
        prev.width === box.width && prev.height === box.height
          ? prev
          : { width: box.width, height: box.height }
      );
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return [ref, size] as const;
}
