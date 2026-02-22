// Tooltip.tsx — Reusable tooltip component, renders via a portal.
// Moved to common/ as it is shared by InputSection and potentially other components.

import React, { useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  className?: string;
  delay?: number;
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  className,
  delay = 400,
}) => {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showTooltip = useCallback(() => {
    timerRef.current = setTimeout(() => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        setPosition({
          top: rect.top - 28,
          left: rect.left + rect.width / 2,
        });
        setVisible(true);
      }
    }, delay);
  }, [delay]);

  const hideTooltip = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    setVisible(false);
  }, []);

  return (
    <div
      ref={triggerRef}
      className={className}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
    >
      {children}
      {visible &&
        createPortal(
          <div
            style={{
              position: "fixed",
              top: position.top,
              left: position.left,
              transform: "translateX(-50%)",
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
            }}
          >
            {content}
          </div>,
          document.body,
        )}
    </div>
  );
};
