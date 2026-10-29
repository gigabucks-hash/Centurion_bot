"use client";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";

/**
 * Window-scrolled virtualization (TanStack Virtual) that switches on only past `threshold` items, so short lists
 * stay plain server-rendered markup (SEO/AT/no-JS friendly) and long ones (target 1000+ rows) render ~a screenful.
 * Rows are measured (measureElement), so variable heights (day headers, wrapped titles) are fine.
 */
export function VirtualList({ count, estimate, render, threshold = 120, overscan = 8, as: Tag = "div", className }: {
  count: number;
  estimate: (i: number) => number;
  render: (i: number) => ReactNode;
  threshold?: number;
  overscan?: number;
  as?: "div" | "ul";
  className?: string;
}) {
  if (count <= threshold) return <Tag className={className}>{Array.from({ length: count }, (_, i) => render(i))}</Tag>;
  return <Virtual count={count} estimate={estimate} render={render} overscan={overscan} Tag={Tag} className={className} />;
}

function Virtual({ count, estimate, render, overscan, Tag, className }: { count: number; estimate: (i: number) => number; render: (i: number) => ReactNode; overscan: number; Tag: "div" | "ul"; className?: string }) {
  const parent = useRef<HTMLDivElement>(null);
  const margin = useScrollMargin(parent);
  const v = useWindowVirtualizer({ count, estimateSize: estimate, overscan, scrollMargin: margin });
  const items = v.getVirtualItems();
  return (
    <div ref={parent} data-virtualized={count}>
      <Tag className={className} style={{ height: v.getTotalSize(), position: "relative" }}>
        {items.map((it) => (
          <div key={it.key} data-index={it.index} ref={v.measureElement} style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${it.start - v.options.scrollMargin}px)` }}>
            {render(it.index)}
          </div>
        ))}
      </Tag>
    </div>
  );
}

/** Table body variant: spacer rows keep <table> semantics and column widths while only visible rows render. */
export function VirtualTbody({ count, rowHeight, render, threshold = 120, colSpan }: { count: number; rowHeight: number; render: (i: number) => ReactNode; threshold?: number; colSpan: number }) {
  if (count <= threshold) return <tbody>{Array.from({ length: count }, (_, i) => render(i))}</tbody>;
  return <VTbody count={count} rowHeight={rowHeight} render={render} colSpan={colSpan} />;
}

function VTbody({ count, rowHeight, render, colSpan }: { count: number; rowHeight: number; render: (i: number) => ReactNode; colSpan: number }) {
  const ref = useRef<HTMLTableSectionElement>(null);
  const margin = useScrollMargin(ref);
  const v = useWindowVirtualizer({ count, estimateSize: () => rowHeight, overscan: 10, scrollMargin: margin });
  const items = v.getVirtualItems();
  const top = items.length ? items[0].start - v.options.scrollMargin : 0;
  const bottom = items.length ? v.getTotalSize() - (items[items.length - 1].end - v.options.scrollMargin) : 0;
  return (
    <tbody ref={ref} data-virtualized={count}>
      {top > 0 && <tr aria-hidden style={{ height: top }}><td colSpan={colSpan} /></tr>}
      {items.map((it) => render(it.index))}
      {bottom > 0 && <tr aria-hidden style={{ height: bottom }}><td colSpan={colSpan} /></tr>}
    </tbody>
  );
}

/** Document offset of the list's top (window virtualizer scrollMargin), measured after layout. */
function useScrollMargin(ref: React.RefObject<HTMLElement | null>): number {
  const [m, setM] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setM(el.getBoundingClientRect().top + window.scrollY);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    return () => ro.disconnect();
  }, [ref]);
  return m;
}
