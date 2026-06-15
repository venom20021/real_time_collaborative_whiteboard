"use client";

import { useCallback, useEffect, useRef } from "react";
import type { CursorData } from "@/types/shared";

interface CursorOverlayProps {
  cursors: Map<string, CursorData>;
  currentUserId: string;
  onMouseMove: (pos: { x: number; y: number }) => void;
  onMouseLeave: () => void;
}

export function CursorOverlay({
  cursors,
  currentUserId,
  onMouseMove,
  onMouseLeave,
}: CursorOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      onMouseMove({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    },
    [onMouseMove]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onMouseLeave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onMouseLeave]);

  const remoteCursors = Array.from(cursors.values()).filter(
    (c) => c.userId !== currentUserId && c.position
  );

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none"
      onMouseMove={handleMouseMove}
      onMouseLeave={onMouseLeave}
    >
      {remoteCursors.map((cursor) => {
        if (!cursor.position) return null;
        return (
          <div
            key={cursor.userId}
            className="absolute transition-all duration-100 ease-linear"
            style={{
              left: cursor.position.x,
              top: cursor.position.y,
              transform: "translate(-2px, -2px)",
            }}
          >
            {/* Cursor arrow */}
            <svg
              width="16"
              height="20"
              viewBox="0 0 16 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M2 2L12 14H7.5L6 18L4 14H2V2Z"
                fill={cursor.color}
                stroke="white"
                strokeWidth="1"
              />
            </svg>
            {/* User name label */}
            <div
              className="absolute left-4 top-0 px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap"
              style={{
                backgroundColor: cursor.color,
                color: "#fff",
              }}
            >
              {cursor.userName}
            </div>
          </div>
        );
      })}
    </div>
  );
}
