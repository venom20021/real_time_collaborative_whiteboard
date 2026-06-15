"use client";

import type { Tool } from "@/types/shared";

interface ToolbarProps {
  activeTool: Tool;
  onToolChange: (tool: Tool) => void;
  onUndo: () => void;
  onRedo: () => void;
  connected: boolean;
  userName: string;
  onLeaveRoom: () => void;
  strokeColor: string;
  fillColor: string;
  strokeWidth: number;
  onStrokeColorChange: (color: string) => void;
  onFillColorChange: (color: string) => void;
  onStrokeWidthChange: (width: number) => void;
  onClearAll: () => void;
  shapeCount: number;
  selectedShapeId: string | null;
  onExport: () => void;
  onDuplicate: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
}

const tools: { id: Tool; label: string; icon: string }[] = [
  { id: "select", label: "Select", icon: "⬚" },
  { id: "pen", label: "Pen", icon: "✏️" },
  { id: "eraser", label: "Eraser", icon: "🧹" },
  { id: "rect", label: "Rectangle", icon: "▬" },
  { id: "circle", label: "Circle", icon: "●" },
  { id: "line", label: "Line", icon: "╱" },
  { id: "arrow", label: "Arrow", icon: "→" },
  { id: "text", label: "Text", icon: "T" },
  { id: "image", label: "Image", icon: "🖼" },
  { id: "pan", label: "Pan", icon: "✋" },
];

const COLOR_PALETTE = [
  "#000000", "#ffffff", "#ef4444", "#f97316", "#f59e0b",
  "#84cc16", "#10b981", "#14b8a6", "#06b6d4", "#3b82f6",
  "#6366f1", "#8b5cf6", "#a855f7", "#d946ef", "#ec4899",
];

const STROKE_WIDTHS = [2, 4, 6, 10, 16];

export function Toolbar({
  activeTool,
  onToolChange,
  onUndo,
  onRedo,
  connected,
  userName,
  onLeaveRoom,
  strokeColor,
  fillColor,
  strokeWidth,
  onStrokeColorChange,
  onFillColorChange,
  onStrokeWidthChange,
  onClearAll,
  shapeCount,
  selectedShapeId,
  onExport,
  onDuplicate,
  onBringToFront,
  onSendToBack,
}: ToolbarProps) {
  const hasSelection = selectedShapeId !== null;

  return (
    <div className="flex items-center justify-between bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 px-3 py-1.5 select-none gap-2 flex-wrap">
      {/* Left: Connection status + user */}
      <div className="flex items-center gap-2 shrink-0">
        <div
          className={`w-2 h-2 rounded-full ${
            connected ? "bg-emerald-500" : "bg-red-500"
          }`}
        />
        <span className="text-xs text-zinc-500 dark:text-zinc-400 hidden sm:inline">
          {connected ? "Connected" : "Offline"}
        </span>
        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 ml-1">
          {userName}
        </span>
      </div>

      {/* Tools */}
      <div className="flex items-center gap-0.5 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-0.5">
        {tools.map((tool) => (
          <button
            key={tool.id}
            onClick={() => onToolChange(tool.id)}
            className={`flex items-center justify-center w-8 h-8 rounded-md text-xs transition-colors ${
              activeTool === tool.id
                ? "bg-white dark:bg-zinc-700 shadow-sm text-indigo-600 dark:text-indigo-400"
                : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
            }`}
            title={tool.label}
          >
            {tool.icon}
          </button>
        ))}
      </div>

      {/* Color & Stroke controls */}
      <div className="flex items-center gap-2">
        {/* Stroke color */}
        <div className="flex items-center gap-1">
          <label className="text-[10px] text-zinc-400 hidden sm:block">Stroke</label>
          <div className="relative group">
            <div
              className="w-5 h-5 rounded-full border border-zinc-300 dark:border-zinc-600 cursor-pointer"
              style={{ backgroundColor: strokeColor }}
              onClick={() => {
                const input = document.createElement("input");
                input.type = "color";
                input.value = strokeColor;
                input.oninput = () => onStrokeColorChange(input.value);
                input.click();
              }}
            />
            <div className="absolute top-6 left-0 hidden group-hover:flex flex-wrap gap-0.5 p-1.5 bg-white dark:bg-zinc-800 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-700 z-50 w-36">
              {COLOR_PALETTE.map((c) => (
                <button
                  key={c}
                  className={`w-5 h-5 rounded-sm border ${
                    c === strokeColor ? "border-zinc-900 dark:border-white ring-1 ring-indigo-500" : "border-zinc-300 dark:border-zinc-600"
                  }`}
                  style={{ backgroundColor: c }}
                  onClick={() => onStrokeColorChange(c)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Fill color */}
        <div className="flex items-center gap-1">
          <label className="text-[10px] text-zinc-400 hidden sm:block">Fill</label>
          <div className="relative group">
            <div
              className="w-5 h-5 rounded-full border border-zinc-300 dark:border-zinc-600 cursor-pointer"
              style={{ backgroundColor: fillColor }}
              onClick={() => {
                const input = document.createElement("input");
                input.type = "color";
                input.value = fillColor === "transparent" ? "#ffffff" : fillColor;
                input.oninput = () => onFillColorChange(input.value);
                input.click();
              }}
            />
            <div className="absolute top-6 left-0 hidden group-hover:flex flex-wrap gap-0.5 p-1.5 bg-white dark:bg-zinc-800 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-700 z-50 w-36">
              <button
                className="w-5 h-5 rounded-sm border border-zinc-300 dark:border-zinc-600 flex items-center justify-center text-[8px] text-zinc-400"
                style={{ backgroundColor: "transparent", backgroundImage: "linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%, #ccc), linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%, #ccc)", backgroundSize: "4px 4px", backgroundPosition: "0 0, 2px 2px" }}
                onClick={() => onFillColorChange("transparent")}
                title="No fill"
              >
                ∅
              </button>
              {COLOR_PALETTE.map((c) => (
                <button
                  key={c}
                  className={`w-5 h-5 rounded-sm border ${
                    c === fillColor ? "border-zinc-900 dark:border-white ring-1 ring-indigo-500" : "border-zinc-300 dark:border-zinc-600"
                  }`}
                  style={{ backgroundColor: c }}
                  onClick={() => onFillColorChange(c)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Stroke width */}
        <div className="flex items-center gap-0.5">
          {STROKE_WIDTHS.map((w) => (
            <button
              key={w}
              className={`w-5 h-5 flex items-center justify-center rounded ${
                strokeWidth === w
                  ? "bg-indigo-100 dark:bg-indigo-900"
                  : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
              onClick={() => onStrokeWidthChange(w)}
              title={`${w}px`}
            >
              <div
                className="rounded-full bg-zinc-700 dark:bg-zinc-300"
                style={{
                  width: Math.min(w * 1.2, 12),
                  height: Math.min(w * 1.2, 12),
                }}
              />
            </button>
          ))}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1">
        {/* Z-order controls (visible when shape selected) */}
        {hasSelection && (
          <>
            <button
              onClick={onBringToFront}
              className="px-1.5 py-1 rounded-md text-xs text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              title="Bring to front"
            >
              ⬆
            </button>
            <button
              onClick={onSendToBack}
              className="px-1.5 py-1 rounded-md text-xs text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              title="Send to back"
            >
              ⬇
            </button>
          </>
        )}

        {/* Undo / Redo */}
        <button
          onClick={onUndo}
          className="px-2 py-1 rounded-md text-xs text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          title="Undo"
        >
          ↩
        </button>
        <button
          onClick={onRedo}
          className="px-2 py-1 rounded-md text-xs text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          title="Redo"
        >
          ↪
        </button>

        {/* Duplicate (visible when shape selected) */}
        {hasSelection && (
          <button
            onClick={onDuplicate}
            className="px-2 py-1 rounded-md text-xs text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            title="Duplicate (Ctrl+D)"
          >
            ⊞
          </button>
        )}

        {/* Export PNG */}
        <button
          onClick={onExport}
          className="px-2 py-1 rounded-md text-xs text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          title="Export as PNG"
        >
          ⬇
        </button>

        {shapeCount > 0 && (
          <button
            onClick={onClearAll}
            className="px-2 py-1 rounded-md text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
            title="Clear all shapes"
          >
            Clear All
          </button>
        )}
        <button
          onClick={onLeaveRoom}
          className="px-2 py-1 rounded-md text-xs text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          Leave
        </button>
      </div>
    </div>
  );
}
