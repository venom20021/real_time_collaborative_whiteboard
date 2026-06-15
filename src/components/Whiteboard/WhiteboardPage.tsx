"use client";

import { useState, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { useWhiteboard } from "@/hooks/useWhiteboard";
import { Toolbar } from "./Toolbar";
import { UsersPanel } from "./UsersPanel";
import { CursorOverlay } from "./CursorOverlay";
import type { Shape, Tool } from "@/types/shared";
import { generateId } from "@/lib/id";

const WhiteboardCanvas = dynamic(
  () => import("./WhiteboardCanvas").then((m) => m.WhiteboardCanvas),
  { ssr: false }
);

interface WhiteboardPageProps {
  roomId: string;
  userName: string;
  userColor: string;
  onLeave: () => void;
}

export function WhiteboardPage({
  roomId,
  userName,
  userColor,
  onLeave,
}: WhiteboardPageProps) {
  const userId = useMemo(() => {
    if (typeof window !== "undefined") {
      const stored = sessionStorage.getItem("whiteboard_userId");
      if (stored) return stored;
      const id = crypto.randomUUID();
      sessionStorage.setItem("whiteboard_userId", id);
      return id;
    }
    return "anon";
  }, []);

  const [selectedTool, setSelectedTool] = useState<Tool>("select");
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [strokeColor, setStrokeColor] = useState("#000000");
  const [fillColor, setFillColor] = useState("#6366f1");
  const [strokeWidth, setStrokeWidth] = useState(4);

  const {
    shapes,
    cursors,
    connected,
    addShape,
    updateShape,
    deleteShape,
    moveCursor,
    undo,
    redo,
  } = useWhiteboard({
    roomId,
    userId,
    userName,
    userColor,
  });

  const handleAddShape = useCallback(
    (shapeData: any) => {
      const shape = {
        ...shapeData,
        stroke: shapeData.stroke !== undefined ? shapeData.stroke : strokeColor,
        fill: shapeData.fill !== undefined ? shapeData.fill : fillColor,
        strokeWidth: shapeData.strokeWidth !== undefined ? shapeData.strokeWidth : strokeWidth,
      };
      addShape(shape);
      if (selectedTool !== "pen") {
        setSelectedTool("select");
      }
    },
    [addShape, strokeColor, fillColor, strokeWidth, selectedTool]
  );

  const handleMouseMove = useCallback(
    (pos: { x: number; y: number } | null) => {
      moveCursor(pos);
    },
    [moveCursor]
  );

  const handleToolChange = useCallback((tool: Tool) => {
    setSelectedTool(tool);
    if (tool !== "select") {
      setSelectedShapeId(null);
    }
  }, []);

  const handleClearAll = useCallback(() => {
    if (shapes.length === 0) return;
    shapes.forEach((shape) => deleteShape(shape.id));
  }, [shapes, deleteShape]);

  // ---- Apply color/width changes to the selected shape ----
  const handleStrokeColorChange = useCallback(
    (color: string) => {
      setStrokeColor(color);
      if (selectedShapeId) {
        updateShape(selectedShapeId, { stroke: color } as any);
      }
    },
    [selectedShapeId, updateShape]
  );

  const handleFillColorChange = useCallback(
    (color: string) => {
      setFillColor(color);
      if (selectedShapeId) {
        updateShape(selectedShapeId, { fill: color } as any);
      }
    },
    [selectedShapeId, updateShape]
  );

  const handleStrokeWidthChange = useCallback(
    (width: number) => {
      setStrokeWidth(width);
      if (selectedShapeId) {
        updateShape(selectedShapeId, { strokeWidth: width } as any);
      }
    },
    [selectedShapeId, updateShape]
  );

  // ---- Select shape handler ----
  const handleSelectShape = useCallback((id: string | null) => {
    setSelectedShapeId(id);
    if (id) {
      setSelectedTool("select");
    }
  }, []);

  // ---- Shape Duplication ----
  const handleDuplicate = useCallback(() => {
    if (!selectedShapeId) return;
    const source = shapes.find((s) => s.id === selectedShapeId);
    if (!source) return;

    const id = generateId();
    const offset = 20;
    addShape({
      ...source,
      id,
      x: source.x + offset,
      y: source.y + offset,
      zIndex: shapes.length,
      data: source.data ? { ...source.data } : null,
    } as any);

    // Select the new duplicate
    setSelectedShapeId(id);
  }, [selectedShapeId, shapes, addShape]);

  // ---- Z-order controls ----
  const handleBringToFront = useCallback(() => {
    if (!selectedShapeId) return;
    const maxZ = Math.max(...shapes.map((s) => s.zIndex || 0), shapes.length - 1);
    updateShape(selectedShapeId, { zIndex: maxZ + 1 } as any);
  }, [selectedShapeId, shapes, updateShape]);

  const handleSendToBack = useCallback(() => {
    if (!selectedShapeId) return;
    const minZ = Math.min(...shapes.map((s) => s.zIndex || 0), 0);
    updateShape(selectedShapeId, { zIndex: minZ - 1 } as any);
  }, [selectedShapeId, shapes, updateShape]);

  // ---- Text editing ----
  const handleTextEdit = useCallback(
    (id: string, text: string) => {
      const shape = shapes.find((s) => s.id === id);
      if (!shape) return;
      updateShape(id, { data: { ...shape.data, text } } as any);
    },
    [shapes, updateShape]
  );

  // ---- Image upload handler ----
  const handleImageUpload = useCallback(
    (pos: { x: number; y: number }) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/png,image/jpeg,image/gif,image/webp,image/svg+xml";
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
          const dataUrl = e.target?.result as string;

          const img = new window.Image();
          img.onload = () => {
            let w = img.naturalWidth;
            let h = img.naturalHeight;
            const maxDim = 800;
            if (w > maxDim || h > maxDim) {
              const ratio = Math.min(maxDim / w, maxDim / h);
              w = Math.round(w * ratio);
              h = Math.round(h * ratio);
            }

            const id = generateId();
            addShape({
              id,
              type: "image" as any,
              x: pos.x,
              y: pos.y,
              width: w,
              height: h,
              fill: "transparent",
              stroke: "transparent",
              strokeWidth: 0,
              rotation: 0,
              opacity: 1,
              zIndex: shapes.length,
              data: { src: dataUrl } as any,
            });
            setSelectedTool("select");
          };
          img.src = dataUrl;
        };
        reader.readAsDataURL(file);
      };
      input.click();
    },
    [addShape, shapes.length]
  );

  // ---- Export as PNG ----
  const handleExport = useCallback(() => {
    const stageContainer = document.querySelector(".konvajs-content canvas") as HTMLCanvasElement;
    if (!stageContainer) return;

    const link = document.createElement("a");
    link.download = `whiteboard-${roomId.slice(0, 8)}.png`;
    link.href = stageContainer.toDataURL("image/png");
    link.click();
  }, [roomId]);

  // ---- Sort shapes by zIndex for correct rendering order ----
  const sortedShapes = useMemo(
    () => [...shapes].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0)),
    [shapes]
  );

  // ---- Transformer transform end ----
  const handleTransformEndShape = useCallback(
    (id: string, attrs: Partial<any>) => {
      updateShape(id, attrs);
    },
    [updateShape]
  );

  return (
    <div className="flex flex-col h-screen">
      <Toolbar
        activeTool={selectedTool}
        onToolChange={handleToolChange}
        onUndo={undo}
        onRedo={redo}
        connected={connected}
        userName={userName}
        onLeaveRoom={onLeave}
        strokeColor={strokeColor}
        fillColor={fillColor}
        strokeWidth={strokeWidth}
        onStrokeColorChange={handleStrokeColorChange}
        onFillColorChange={handleFillColorChange}
        onStrokeWidthChange={handleStrokeWidthChange}
        onClearAll={handleClearAll}
        shapeCount={shapes.length}
        selectedShapeId={selectedShapeId}
        onExport={handleExport}
        onDuplicate={handleDuplicate}
        onBringToFront={handleBringToFront}
        onSendToBack={handleSendToBack}
      />

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 relative">
          <WhiteboardCanvas
            shapes={sortedShapes}
            selectedTool={selectedTool}
            selectedShapeId={selectedShapeId}
            onSelectShape={handleSelectShape}
            onAddShape={handleAddShape}
            onUpdateShape={updateShape}
            onDeleteShape={deleteShape}
            onDuplicate={handleDuplicate}
            onMouseMove={handleMouseMove}
            onImageUpload={handleImageUpload}
            onTransformEndShape={handleTransformEndShape}
            onTextEdit={handleTextEdit}
          />
          <CursorOverlay
            cursors={cursors}
            currentUserId={userId}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => moveCursor(null)}
          />
        </div>
        <UsersPanel cursors={cursors} currentUserId={userId} />
      </div>
    </div>
  );
}
