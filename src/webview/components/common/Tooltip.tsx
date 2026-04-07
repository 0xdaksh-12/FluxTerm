import React, { useState, useRef, useCallback, useLayoutEffect } from "react";
import { createPortal } from "react-dom";

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  className?: string;
  /** Hover delay in ms before tooltip appears. Default 400. */
  delay?: number;
}

/** Minimum gap between tooltip edge and viewport edge. */
const MARGIN = 6;

interface RawPos {
  centerX: number; // horizontal center of trigger
  top: number; // desired top (above trigger)
  triggerBottom: number; // used for flip-to-below
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  className,
  delay = 400,
}) => {
  const [visible, setVisible] = useState(false);
  // rawPos is the unclamped desired position, computed from trigger rect
  const [rawPos, setRawPos] = useState<RawPos>({
    centerX: 0,
    top: 0,
    triggerBottom: 0,
  });
  // finalPos is set after measuring the tooltip's actual rendered size
  const [finalPos, setFinalPos] = useState<{
    top: number;
    left: number;
    ready: boolean;
  }>({ top: 0, left: 0, ready: false });

  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(() => {
    timerRef.current = setTimeout(() => {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      setRawPos({
        centerX: rect.left + rect.width / 2,
        top: rect.top - 30,
        triggerBottom: rect.bottom + 4,
      });
      setFinalPos({ top: 0, left: 0, ready: false });
      setVisible(true);
    }, delay);
  }, [delay]);

  const hide = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
    setFinalPos((p) => ({ ...p, ready: false }));
  }, []);

  /**
   * Phase 2: after the tooltip is in the DOM (but invisible, opacity 0),
   * measure its actual rendered width and clamp to viewport.
   */
  useLayoutEffect(() => {
    if (!visible || !tooltipRef.current) return;

    const el = tooltipRef.current;
    const w = el.offsetWidth;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Compute left edge from center, then clamp horizontally
    let left = rawPos.centerX - w / 2;
    left = Math.max(MARGIN, Math.min(left, vw - w - MARGIN));

    // Flip below trigger if tooltip would go above viewport
    let top = rawPos.top;
    if (top < MARGIN) {
      top = rawPos.triggerBottom;
    }
    // Clamp vertically too (rare but possible)
    top = Math.max(MARGIN, Math.min(top, vh - el.offsetHeight - MARGIN));

    setFinalPos({ top, left, ready: true });
  }, [visible, rawPos]);

  return (
    <div
      ref={triggerRef}
      className={className}
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      {children}
      {visible &&
        createPortal(
          <div
            ref={tooltipRef}
            style={{
              position: "fixed",
              top: finalPos.top,
              left: finalPos.left,
              backgroundColor: "var(--vscode-editorHoverWidget-background)",
              color: "var(--vscode-editorHoverWidget-foreground)",
              border: "1px solid var(--vscode-editorHoverWidget-border)",
              borderRadius: "3px",
              padding: "3px 8px",
              fontSize: "11px",
              whiteSpace: "nowrap",
              zIndex: 9999,
              pointerEvents: "none",
              boxShadow: "0 2px 6px rgba(0,0,0,0.4)",
              // Phase 1: invisible for measurement; Phase 2: fade in
              opacity: finalPos.ready ? 1 : 0,
              transition: finalPos.ready ? "opacity 80ms ease" : "none",
            }}
          >
            {content}
          </div>,
          document.body,
        )}
    </div>
  );
};
