"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Stage, Layer, Rect, Line as KonvaLine, Transformer } from "react-konva";
import type { Shape, ShapeType, ShapeData, Tool } from "@/types/shared";
import { ShapeRenderer } from "./ShapeRenderer";
import { TextEditOverlay } from "./TextEditOverlay";
import { generateId } from "@/lib/id";

interface WhiteboardCanvasProps {
  shapes: Shape[];
  selectedTool: Tool;
  selectedShapeId: string | null;
  onSelectShape: (id: string | null) => void;
  onAddShape: (shape: any) => void;
  onUpdateShape: (id: string, updates: Partial<Shape>) => void;
  onDeleteShape: (id: string) => void;
  onDuplicate: () => void;
  onMouseMove: (pos: { x: number; y: number } | null) => void;
  onImageUpload: (pos: { x: number; y: number }) => void;
  onTransformEndShape: (id: string, attrs: Partial<Shape>) => void;
  onTextEdit: (id: string, text: string) => void;
}

export function WhiteboardCanvas({
  shapes,
  selectedTool,
  selectedShapeId,
  onSelectShape,
  onAddShape,
  onUpdateShape,
  onDeleteShape,
  onDuplicate,
  onMouseMove,
  onImageUpload,
  onTransformEndShape,
  onTextEdit,
}: WhiteboardCanvasProps) {
  const stageRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const transformerRef = useRef<any>(null);
  const [dimensions, setDimensions] = useState({ width: 1200, height: 800 });
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawCurrent, setDrawCurrent] = useState<{ x: number; y: number } | null>(null);
  const [penPoints, setPenPoints] = useState<{ x: number; y: number }[]>([]);
  const [penPressure, setPenPressure] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [stageScale, setStageScale] = useState(1);
  const [editingText, setEditingText] = useState<{ id: string; text: string; x: number; y: number; width: number; height: number } | null>(null);
  const isPenInUse = useRef(false);

  useEffect(() => {
    const updateSize = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight - 120,
      });
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  // Attach transformer to selected shape
  useEffect(() => {
    const transformer = transformerRef.current;
    const stage = stageRef.current;
    if (!transformer || !stage) return;

    if (selectedShapeId) {
      const node = stage.findOne("#" + selectedShapeId);
      if (node) {
        transformer.nodes([node]);
        transformer.getLayer()?.batchDraw();
      }
    } else {
      transformer.nodes([]);
      transformer.getLayer()?.batchDraw();
    }
  }, [selectedShapeId]);

  const getRelativePos = useCallback(
    (e: any) => {
      const stage = stageRef.current;
      if (!stage) return { x: 0, y: 0 };
      const pointer = stage.getPointerPosition();
      return {
        x: (pointer.x - stagePos.x) / stageScale,
        y: (pointer.y - stagePos.y) / stageScale,
      };
    },
    [stagePos, stageScale]
  );

  // ---- Apple Pencil / Pointer Event integration ----
  const handlePointerDown = useCallback(
    (e: any) => {
      const evt = e.evt;
      // Track pen usage for palm rejection
      if (evt.pointerType === "pen") {
        isPenInUse.current = true;
      }
      if (evt.pointerType === "touch" && isPenInUse.current) {
        // Palm rejection: ignore touch events while pen is active
        return;
      }
      // Store pressure for pen tool
      if (evt.pressure && evt.pressure > 0) {
        setPenPressure(evt.pressure);
      }

      // If editing text, don't handle canvas events
      if (editingText) return;

      if (selectedTool === "select" || selectedTool === "pan") {
        if (e.target === e.target.getStage()) {
          onSelectShape(null);
        }
        return;
      }

      // Eraser: delete shape on click
      if (selectedTool === "eraser") {
        const clickedShape = e.target;
        let id = clickedShape?.id?.();
        if (!id) {
          let parent = clickedShape?.getParent?.();
          while (parent && !id) {
            id = parent.id?.();
            parent = parent.getParent();
          }
        }
        if (id && id !== "__bg") {
          onDeleteShape(id);
          onSelectShape(null);
        }
        return;
      }

      // Image upload tool
      if (selectedTool === "image") {
        const pos = getRelativePos(e);
        onImageUpload(pos);
        return;
      }

      const pos = getRelativePos(e);

      if (selectedTool === "pen") {
        setIsDrawing(true);
        setPenPoints([pos]);
        return;
      }

      setIsDrawing(true);
      setDrawStart(pos);
      setDrawCurrent(pos);
    },
    [selectedTool, getRelativePos, onSelectShape, onDeleteShape, onImageUpload, editingText]
  );

  const handlePointerMove = useCallback(
    (e: any) => {
      const evt = e.evt;
      if (evt.pointerType === "touch" && isPenInUse.current) return;
      if (evt.pressure && evt.pressure > 0) {
        setPenPressure(evt.pressure);
      }

      const pos = getRelativePos(e);
      onMouseMove(pos);

      if (isDrawing && selectedTool === "pen") {
        setPenPoints((prev) => [...prev, { ...pos, pressure: evt.pressure || 1 } as any]);
        return;
      }

      if (isDrawing && drawStart) {
        setDrawCurrent(pos);
      }
    },
    [isDrawing, drawStart, selectedTool, getRelativePos, onMouseMove]
  );

  const handlePointerUp = useCallback(
    (e: any) => {
      const evt = e.evt;
      if (evt.pointerType === "pen") {
        isPenInUse.current = false;
      }
      if (evt.pointerType === "touch" && isPenInUse.current) return;

      setPenPressure(1);

      if (!isDrawing || selectedTool === "select" || selectedTool === "pan") {
        setIsDrawing(false);
        setDrawStart(null);
        setDrawCurrent(null);
        setPenPoints([]);
        return;
      }

      const pos = drawCurrent || getRelativePos(e);

      // Pen/freehand drawing with pressure support
      if (selectedTool === "pen") {
        if (penPoints.length > 2) {
          const xs = penPoints.map((p: any) => p.x);
          const ys = penPoints.map((p: any) => p.y);
          const minX = Math.min(...xs);
          const minY = Math.min(...ys);
          const maxX = Math.max(...xs);
          const maxY = Math.max(...ys);

          const id = generateId();
          onAddShape({
            id,
            type: "path" as ShapeType,
            x: minX,
            y: minY,
            width: Math.max(maxX - minX, 10),
            height: Math.max(maxY - minY, 10),
            fill: "transparent",
            rotation: 0,
            opacity: 1,
            zIndex: shapes.length,
            data: {
              path: penPoints.map((p: any) => ({
                x: p.x - minX,
                y: p.y - minY,
                pressure: p.pressure || 1,
              })),
            } as ShapeData,
          });
        }

        setIsDrawing(false);
        setPenPoints([]);
        return;
      }

      // Standard shape drawing
      if (!drawStart) {
        setIsDrawing(false);
        return;
      }

      const x = Math.min(drawStart.x, pos.x);
      const y = Math.min(drawStart.y, pos.y);
      const width = Math.abs(pos.x - drawStart.x) || 50;
      const height = Math.abs(pos.y - drawStart.y) || 50;

      const shapeType = selectedTool as ShapeType;
      const id = generateId();
      const baseShape: any = {
        id,
        type: shapeType,
        x,
        y,
        width: Math.max(width, 10),
        height: Math.max(height, 10),
        rotation: 0,
        opacity: 1,
        zIndex: shapes.length,
        data: null,
      };

      if (shapeType === "circle") {
        baseShape.width = Math.max(width, 20);
        baseShape.height = Math.max(height, 20);
      } else if (shapeType === "line") {
        const endX = pos.x - drawStart.x;
        const endY = pos.y - drawStart.y;
        baseShape.data = { points: [0, 0, endX, endY] };
        baseShape.x = drawStart.x;
        baseShape.y = drawStart.y;
        baseShape.width = Math.abs(endX);
        baseShape.height = Math.abs(endY);
        baseShape.fill = "transparent";
      } else if (shapeType === "arrow") {
        const endX = pos.x - drawStart.x;
        const endY = pos.y - drawStart.y;
        baseShape.data = { points: [0, 0, endX, endY] };
        baseShape.x = drawStart.x;
        baseShape.y = drawStart.y;
        baseShape.width = Math.abs(endX);
        baseShape.height = Math.abs(endY);
        baseShape.fill = "transparent";
      } else if (shapeType === "text") {
        baseShape.data = { text: "Text" };
        baseShape.fill = "#000000";
        baseShape.stroke = "transparent";
        baseShape.strokeWidth = 0;
        baseShape.width = Math.max(width, 60);
        baseShape.height = Math.max(height, 30);
      }

      onAddShape(baseShape);
      setIsDrawing(false);
      setDrawStart(null);
      setDrawCurrent(null);
    },
    [isDrawing, drawStart, drawCurrent, selectedTool, getRelativePos, shapes.length, onAddShape, penPoints]
  );

  const handleDragEnd = useCallback(
    (id: string, x: number, y: number) => {
      onUpdateShape(id, { x, y } as Partial<Shape>);
    },
    [onUpdateShape]
  );

  const handleTransformEnd = useCallback(
    (id: string, attrs: Partial<Shape>) => {
      onUpdateShape(id, attrs);
    },
    [onUpdateShape]
  );

  const handleWheel = useCallback((e: any) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;

    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();
    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    const newScale = e.evt.deltaY > 0 ? oldScale * 0.9 : oldScale * 1.1;
    const clampedScale = Math.max(0.1, Math.min(newScale, 5));

    setStageScale(clampedScale);
    setStagePos({
      x: pointer.x - mousePointTo.x * clampedScale,
      y: pointer.y - mousePointTo.y * clampedScale,
    });
  }, []);

  // Handle transformer transform end
  const handleTransformerTransformEnd = useCallback(
    (e: any) => {
      const transformer = transformerRef.current;
      if (!transformer) return;

      const shapeNode = transformer.nodes()[0];
      if (!shapeNode) return;

      const id = shapeNode.id();
      if (!id) return;

      const scaleX = shapeNode.scaleX();
      const scaleY = shapeNode.scaleY();

      onTransformEndShape(id, {
        x: shapeNode.x(),
        y: shapeNode.y(),
        rotation: shapeNode.rotation(),
        width: Math.max(shapeNode.width() * scaleX, 5),
        height: Math.max(shapeNode.height() * scaleY, 5),
      });

      shapeNode.scaleX(1);
      shapeNode.scaleY(1);
    },
    [onTransformEndShape]
  );

  // ---- Keyboard shortcuts ----
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (editingText) return; // Don't handle shortcuts while editing text

      // Delete / Backspace
      if ((e.key === "Delete" || e.key === "Backspace") && selectedShapeId) {
        e.preventDefault();
        onDeleteShape(selectedShapeId);
        onSelectShape(null);
      }
      // Escape
      if (e.key === "Escape") {
        onSelectShape(null);
      }
      // Duplicate: Ctrl+D / Cmd+D
      if ((e.key === "d" || e.key === "D") && (e.ctrlKey || e.metaKey) && selectedShapeId) {
        e.preventDefault();
        onDuplicate();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [selectedShapeId, onDeleteShape, onSelectShape, onDuplicate, editingText]);

  // ---- Text editing ----
  const handleStartTextEdit = useCallback(
    (shapeId: string) => {
      const shape = shapes.find((s) => s.id === shapeId);
      if (!shape || shape.type !== "text") return;
      setEditingText({
        id: shapeId,
        text: shape.data?.text || "Text",
        x: shape.x,
        y: shape.y,
        width: shape.width,
        height: shape.height,
      });
    },
    [shapes]
  );

  const handleSaveText = useCallback(
    (newText: string) => {
      if (editingText) {
        onTextEdit(editingText.id, newText);
      }
      setEditingText(null);
    },
    [editingText, onTextEdit]
  );

  const handleCancelText = useCallback(() => {
    setEditingText(null);
  }, []);

  const getDrawPreview = () => {
    if (!isDrawing || selectedTool === "select" || selectedTool === "pan") return null;

    if (selectedTool === "pen" && penPoints.length > 1) {
      return { type: "pen" as const, points: penPoints };
    }

    if (!drawStart || !drawCurrent) return null;
    return {
      type: "rect" as const,
      x: Math.min(drawStart.x, drawCurrent.x),
      y: Math.min(drawStart.y, drawCurrent.y),
      width: Math.abs(drawCurrent.x - drawStart.x),
      height: Math.abs(drawCurrent.y - drawStart.y),
    };
  };

  const drawPreview = getDrawPreview();

  return (
    <div
      ref={containerRef}
      className="flex-1 relative overflow-hidden bg-zinc-50 dark:bg-zinc-950"
      style={{ touchAction: "none" }} // Palm rejection for Apple Pencil
    >
      <Stage
        ref={stageRef}
        width={dimensions.width}
        height={dimensions.height}
        x={stagePos.x}
        y={stagePos.y}
        scaleX={stageScale}
        scaleY={stageScale}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
        draggable={selectedTool === "pan"}
      >
        <Layer>
          <Rect x={-5000} y={-5000} width={10000} height={10000} fill="#fafafa" listening={false} />

          {/* Pen preview */}
          {drawPreview?.type === "pen" && (
            <KonvaLine
              points={drawPreview.points.flatMap((p: any) => [p.x, p.y])}
              stroke="#6366f1"
              strokeWidth={3}
              lineCap="round"
              lineJoin="round"
              tension={0.3}
              listening={false}
            />
          )}

          {/* Shape drawing preview */}
          {drawPreview?.type === "rect" && (
            <Rect
              x={drawPreview.x}
              y={drawPreview.y}
              width={drawPreview.width}
              height={drawPreview.height}
              stroke="#6366f1"
              strokeWidth={1}
              dash={[4, 4]}
              listening={false}
            />
          )}

          {shapes.map((shape) => (
            <ShapeRenderer
              key={shape.id}
              shape={shape}
              isSelected={shape.id === selectedShapeId}
              onSelect={() => onSelectShape(shape.id)}
              onDoubleClick={() => handleStartTextEdit(shape.id)}
              onDragEnd={(x, y) => handleDragEnd(shape.id, x, y)}
              onTransformEnd={(attrs) => handleTransformEnd(shape.id, attrs)}
            />
          ))}

          {/* Transformer */}
          <Transformer
            ref={transformerRef}
            boundBoxFunc={(oldBox, newBox) => {
              if (newBox.width < 10 || newBox.height < 10) return oldBox;
              return newBox;
            }}
            onTransformEnd={handleTransformerTransformEnd}
            rotateEnabled={true}
            enabledAnchors={[
              "top-left", "top-center", "top-right",
              "middle-left", "middle-right",
              "bottom-left", "bottom-center", "bottom-right",
            ]}
            borderStroke="#6366f1"
            borderStrokeWidth={1.5}
            anchorFill="#ffffff"
            anchorStroke="#6366f1"
            anchorSize={8}
            anchorCornerRadius={2}
          />
        </Layer>
      </Stage>

      {/* Text editing overlay */}
      {editingText && (
        <TextEditOverlay
          x={editingText.x}
          y={editingText.y}
          width={editingText.width}
          height={editingText.height}
          initialText={editingText.text}
          stageScale={stageScale}
          stageX={stagePos.x}
          stageY={stagePos.y}
          onSave={handleSaveText}
          onCancel={handleCancelText}
        />
      )}
    </div>
  );
}
