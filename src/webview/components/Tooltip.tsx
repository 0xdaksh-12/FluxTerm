import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  delay?: number;
  className?: string;
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  delay = 350,
  className = "inline-block",
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<any>(null);

  const handleMouseEnter = () => {
    timeoutRef.current = setTimeout(() => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        const spaceAbove = rect.top;
        const tooltipHeight = 40; // Approximate
        const placeAbove = spaceAbove > tooltipHeight + 10;

        setPosition({
          top: placeAbove ? rect.top - 36 : rect.bottom + 6,
          left: rect.left + rect.width / 2,
        });
        setIsVisible(true);
      }
    }, delay);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsVisible(false);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={className}
      >
        {children}
      </div>
      {isVisible &&
        createPortal(
          <div
            style={{
              position: "fixed",
              top: position.top,
              left: position.left,
              transform: "translateX(-10%)",
              backgroundColor: "var(--vscode-editorHoverWidget-background)",
              color: "var(--vscode-editorHoverWidget-foreground)",
              border: "1px solid var(--vscode-editorHoverWidget-border)",
              borderRadius: "4px",
              padding: "4px 8px",
              fontSize: "12px",
              zIndex: 10000,
              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
              whiteSpace: "nowrap",
              maxWidth: "none",
              width: "max-content",
              pointerEvents: "none",
            }}
          >
            {content}
          </div>,
          document.body,
        )}
    </>
  );
};
