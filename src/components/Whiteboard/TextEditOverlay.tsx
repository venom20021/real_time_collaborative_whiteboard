"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface TextEditOverlayProps {
  x: number;
  y: number;
  width: number;
  height: number;
  initialText: string;
  stageScale: number;
  stageX: number;
  stageY: number;
  onSave: (text: string) => void;
  onCancel: () => void;
}

export function TextEditOverlay({
  x,
  y,
  width,
  height,
  initialText,
  stageScale,
  stageX,
  stageY,
  onSave,
  onCancel,
}: TextEditOverlayProps) {
  const [text, setText] = useState(initialText);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Calculate screen position from stage coordinates
  const screenX = x * stageScale + stageX;
  const screenY = y * stageScale + stageY;
  const scaledW = Math.max(width * stageScale, 60);
  const scaledH = Math.max(height * stageScale, 30);

  // Auto-focus and select all on mount
  useEffect(() => {
    const input = inputRef.current;
    if (input) {
      input.focus();
      input.select();
    }
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onSave(text);
      }
      if (e.key === "Escape") {
        onCancel();
      }
    },
    [text, onSave, onCancel]
  );

  return (
    <textarea
      ref={inputRef}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => onSave(text)}
      onKeyDown={handleKeyDown}
      style={{
        position: "fixed",
        left: screenX,
        top: screenY,
        width: scaledW,
        height: scaledH,
        fontSize: Math.max(16 * stageScale, 14),
        padding: "4px 6px",
        border: "2px solid #6366f1",
        borderRadius: 4,
        background: "white",
        color: "#18181b",
        outline: "none",
        resize: "both",
        overflow: "hidden",
        zIndex: 1000,
        fontFamily: "inherit",
        lineHeight: 1.4,
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
      }}
    />
  );
}
