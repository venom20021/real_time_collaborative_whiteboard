"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Stage, Layer, Rect, Line as KonvaLine, Transformer } from "react-konva";
import type { Shape, ShapeType, ShapeData, Tool } from "@/types/shared";
import { ShapeRenderer } from "./ShapeRenderer";
import { TextEditOverlay } from "./TextEditOverlay";
import { ParticleOverlay, createEraseParticles } from "./ParticleOverlay";
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
  onViewportMove?: (viewport: { x: number; y: number; scale: number }) => void;
  viewportFromRemote?: { x: number; y: number; scale: number } | null;
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
  onViewportMove,
  viewportFromRemote,
}: WhiteboardCanvasProps) {
  const stageRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const transformerRef = useRef<any>(null);
  const [dimensions, setDimensions] = useState({ width: 1200, height: 800 });
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawCurrent, setDrawCurrent] = useState<{ x: number; y: number } | null>(null);
  // Center the origin so all devices see the same middle area
  const [stagePos, setStagePos] = useState({ x: 600, y: 400 });
  const [stageScale, setStageScale] = useState(1);
  const [editingText, setEditingText] = useState<{ id: string; text: string; x: number; y: number; width: number; height: number } | null>(null);

  // Refs for low-latency pen drawing
  const penPointsRef = useRef<{ x: number; y: number; pressure: number }[]>([]);
  const penPreviewLineRef = useRef<any>(null);
  const isPenInUseRef = useRef(false);
  const isErasingRef = useRef(false);

  // Refs for RAF-batched erase with animated fade-out
  const eraseBatchRef = useRef<Set<string>>(new Set());
  const eraseRafPendingRef = useRef(false);
  const pendingEraseTimeoutsRef = useRef<number[]>([]);

  // Eraser hover highlight
  const [hoveredShapeId, setHoveredShapeId] = useState<string | null>(null);

  // Particle effects for erase
  const [particles, setParticles] = useState<any[]>([]);
  const particleIdCounterRef = useRef(0);
  const shapesRef = useRef(shapes);
  const stagePosRef = useRef(stagePos);
  const stageScaleRef = useRef(stageScale);

  // Keep refs in sync with latest values
  shapesRef.current = shapes;
  stagePosRef.current = stagePos;
  stageScaleRef.current = stageScale;

  // Clear hover highlight when tool changes away from eraser
  useEffect(() => {
    if (selectedTool !== "eraser") {
      setHoveredShapeId(null);
    }
  }, [selectedTool]);

  // ---- RAF-batched animated erase: fade out shapes via Yjs sync, then delete ----
  const processEraseBatch = useCallback(() => {
    eraseRafPendingRef.current = false;
    const batch = Array.from(eraseBatchRef.current);
    eraseBatchRef.current.clear();

    if (batch.length === 0) return;

    // Spawn particles at erased shape positions (in screen coords)
    const newParticles: any[] = [];
    batch.forEach((shapeId) => {
      const shape = shapesRef.current.find((s) => s.id === shapeId);
      if (shape) {
        const cx =
          shape.x * stageScaleRef.current +
          stagePosRef.current.x +
          (shape.width * stageScaleRef.current) / 2;
        const cy =
          shape.y * stageScaleRef.current +
          stagePosRef.current.y +
          (shape.height * stageScaleRef.current) / 2;
        const particles = createEraseParticles(
          cx,
          cy,
          () => particleIdCounterRef.current++,
          10
        );
        newParticles.push(...particles);
      }
    });
    if (newParticles.length > 0) {
      setParticles((prev) => [...prev, ...newParticles]);
    }

    // Animated fade: each shape dims over ~300ms, synced to all clients via Yjs
    batch.forEach((shapeId, index) => {
      const staggerMs = index * 30; // slight stagger for multiple shapes

      // Step 1: dim to visible-but-fading
      const t1 = window.setTimeout(() => {
        onUpdateShape(shapeId, { opacity: 0.3 } as any);
      }, staggerMs);
      pendingEraseTimeoutsRef.current.push(t1);

      // Step 2: nearly invisible
      const t2 = window.setTimeout(() => {
        onUpdateShape(shapeId, { opacity: 0.05 } as any);
      }, staggerMs + 120);
      pendingEraseTimeoutsRef.current.push(t2);

      // Step 3: delete from Yjs (removes from all clients)
      const t3 = window.setTimeout(() => {
        onDeleteShape(shapeId);
        onSelectShape(null);
      }, staggerMs + 280);
      pendingEraseTimeoutsRef.current.push(t3);
    });
  }, [onUpdateShape, onDeleteShape, onSelectShape]);

  // Schedules an erase batch to be processed on the next animation frame
  const scheduleEraseBatch = useCallback(() => {
    if (eraseRafPendingRef.current) return;
    eraseRafPendingRef.current = true;
    requestAnimationFrame(() => processEraseBatch());
  }, [processEraseBatch]);

  // Cleanup pending erase timeouts on unmount
  useEffect(() => {
    return () => {
      pendingEraseTimeoutsRef.current.forEach(clearTimeout);
      pendingEraseTimeoutsRef.current = [];
    };
  }, []);

  // ---- Smooth stage transition helper ----
  // Animates the Konva Stage node directly via RAF, then syncs React state on completion
  // Cancelled automatically if the user zooms/pans via handleWheel
  const transitionRafRef = useRef<number | null>(null);
  const viewportDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cancel RAF and debounce on unmount
  useEffect(() => {
    return () => {
      if (transitionRafRef.current !== null) {
        cancelAnimationFrame(transitionRafRef.current);
      }
      if (viewportDebounceRef.current !== null) {
        clearTimeout(viewportDebounceRef.current);
      }
    };
  }, []);

  const cancelStageTransition = useCallback(() => {
    if (transitionRafRef.current !== null) {
      cancelAnimationFrame(transitionRafRef.current);
      transitionRafRef.current = null;
    }
  }, []);

  const animateStageTo = useCallback((toPos: { x: number; y: number }, toScale: number) => {
    // Cancel any previous transition
    cancelStageTransition();

    const stage = stageRef.current;
    if (!stage) {
      setStagePos(toPos);
      setStageScale(toScale);
      return;
    }

    const fromX = stage.x();
    const fromY = stage.y();
    const fromScale = stage.scaleX();
    const duration = 400;
    const startTime = performance.now();

    const animate = (now: number) => {
      const s = stageRef.current;
      if (!s) return; // unmounted

      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const ease = 1 - Math.pow(1 - t, 3);

      const x = fromX + (toPos.x - fromX) * ease;
      const y = fromY + (toPos.y - fromY) * ease;
      const scale = fromScale + (toScale - fromScale) * ease;

      s.x(x);
      s.y(y);
      s.scaleX(scale);
      s.scaleY(scale);
      s.getLayer()?.batchDraw();

      if (t < 1) {
        transitionRafRef.current = requestAnimationFrame(animate);
      } else {
        transitionRafRef.current = null;
        setStagePos(toPos);
        setStageScale(toScale);
      }
    };

    transitionRafRef.current = requestAnimationFrame(animate);
  }, [cancelStageTransition]);

  // Helper to broadcast the current viewport to other users (debounced)
  const broadcastViewport = useCallback((x?: number, y?: number, scale?: number) => {
    if (!onViewportMove) return;
    if (viewportDebounceRef.current !== null) {
      clearTimeout(viewportDebounceRef.current);
    }
    viewportDebounceRef.current = setTimeout(() => {
      viewportDebounceRef.current = null;
      // Guard against stale callbacks after unmount
      if (!containerRef.current) return;
      onViewportMove({
        x: x ?? stagePosRef.current.x,
        y: y ?? stagePosRef.current.y,
        scale: scale ?? stageScaleRef.current,
      });
    }, 100);
  }, [onViewportMove]);

  // Apply remote viewport updates with smooth animation
  const prevRemoteViewportRef = useRef<typeof viewportFromRemote>(null);
  useEffect(() => {
    if (!viewportFromRemote) {
      prevRemoteViewportRef.current = null;
      return;
    }
    // Avoid re-applying the same viewport
    if (
      prevRemoteViewportRef.current &&
      prevRemoteViewportRef.current.x === viewportFromRemote.x &&
      prevRemoteViewportRef.current.y === viewportFromRemote.y &&
      prevRemoteViewportRef.current.scale === viewportFromRemote.scale
    ) {
      return;
    }
    prevRemoteViewportRef.current = viewportFromRemote;
    animateStageTo(
      { x: viewportFromRemote.x, y: viewportFromRemote.y },
      viewportFromRemote.scale
    );
  }, [viewportFromRemote, animateStageTo]);

  // Track whether we've centered the stage on mount
  const hasAutoCenteredRef = useRef(false);
  const hasAutoFittedRef = useRef(false);

  useEffect(() => {
    const updateSize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight - 120;
      setDimensions({ width: w, height: h });

      // Center the stage origin once on mount with actual window dimensions
      if (!hasAutoCenteredRef.current && !hasAutoFittedRef.current) {
        animateStageTo({ x: w / 2, y: h / 2 }, 1);
        hasAutoCenteredRef.current = true;
      }
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, [animateStageTo]);

  // Auto-fit viewport to show all shapes when first loaded
  useEffect(() => {
    if (hasAutoFittedRef.current) return;
    if (shapes.length === 0) return;

    // Compute bounding box of all shapes
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const shape of shapes) {
      const sx = shape.x;
      const sy = shape.y;
      const ex = shape.x + (shape.width || 20);
      const ey = shape.y + (shape.height || 20);
      if (sx < minX) minX = sx;
      if (sy < minY) minY = sy;
      if (ex > maxX) maxX = ex;
      if (ey > maxY) maxY = ey;
    }

    if (!isFinite(minX)) return;

    const padding = 60;
    const bbWidth = maxX - minX + padding * 2;
    const bbHeight = maxY - minY + padding * 2;
    const bbCenterX = (minX + maxX) / 2;
    const bbCenterY = (minY + maxY) / 2;

    const scaleX = dimensions.width / bbWidth;
    const scaleY = dimensions.height / bbHeight;
    // Clamp scale to reasonable range
    const scale = Math.max(0.3, Math.min(Math.min(scaleX, scaleY), 2));

    const targetPos = {
      x: dimensions.width / 2 - bbCenterX * scale,
      y: dimensions.height / 2 - bbCenterY * scale,
    };
    animateStageTo(targetPos, scale);

    // Sync viewport to other users
    broadcastViewport(targetPos.x, targetPos.y, scale);

    hasAutoFittedRef.current = true;
    hasAutoCenteredRef.current = true; // prevent auto-centering from overriding
  }, [shapes, dimensions, animateStageTo, broadcastViewport]);

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
        isPenInUseRef.current = true;
      }
      if (evt.pointerType === "touch" && isPenInUseRef.current) {
        // Palm rejection: ignore touch events while pen is active
        return;
      }

      // If editing text, don't handle canvas events
      if (editingText) return;

      if (selectedTool === "select" || selectedTool === "pan") {
        if (e.target === e.target.getStage()) {
          onSelectShape(null);
        }
        return;
      }

      // Eraser: start erasing mode + queue shape for RAF-batched animated erase
      if (selectedTool === "eraser") {
        isErasingRef.current = true;
        const clickedShape = e.target;
        let id = clickedShape?.id?.();
        if (!id) {
          let parent = clickedShape?.getParent?.();
          while (parent && !id) {
            id = parent.id?.();
            parent = parent.getParent();
          }
        }
        if (id && id !== "__bg" && !eraseBatchRef.current.has(id)) {
          eraseBatchRef.current.add(id);
          setHoveredShapeId(null);
          scheduleEraseBatch();
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
        penPointsRef.current = [{ ...pos, pressure: evt.pressure || 1 }];
        return;
      }

      setIsDrawing(true);
      setDrawStart(pos);
      setDrawCurrent(pos);
    },
    [selectedTool, getRelativePos, onSelectShape, onDeleteShape, onImageUpload, editingText, scheduleEraseBatch]
  );

  const handlePointerMove = useCallback(
    (e: any) => {
      const evt = e.evt;
      if (evt.pointerType === "touch" && isPenInUseRef.current) return;

      const pos = getRelativePos(e);
      onMouseMove(pos);

      // Eraser hover highlight (when not actively erasing)
      if (selectedTool === "eraser" && !isErasingRef.current) {
        const target = e.target;
        let id = target?.id?.();
        if (!id) {
          let parent = target?.getParent?.();
          while (parent && !id) {
            id = parent.id?.();
            parent = parent.getParent();
          }
        }
        setHoveredShapeId(id && id !== "__bg" ? id : null);
      }

      // Eraser: drag-to-erase — queue shapes for RAF-batched animated erase
      if (isErasingRef.current && selectedTool === "eraser") {
        const target = e.target;
        let id = target?.id?.();
        if (!id) {
          let parent = target?.getParent?.();
          while (parent && !id) {
            id = parent.id?.();
            parent = parent.getParent();
          }
        }
        if (id && id !== "__bg" && !eraseBatchRef.current.has(id)) {
          eraseBatchRef.current.add(id);
          scheduleEraseBatch();
        }
        return;
      }

      // Pen: update ref and directly manipulate Konva line (no React re-render)
      if (isDrawing && selectedTool === "pen") {
        penPointsRef.current.push({ ...pos, pressure: evt.pressure || 1 });
        const line = penPreviewLineRef.current;
        if (line) {
          line.points(penPointsRef.current.flatMap(p => [p.x, p.y]));
          line.getLayer()?.batchDraw();
        }
        return;
      }

      if (isDrawing && drawStart) {
        setDrawCurrent(pos);
      }
    },
    [isDrawing, drawStart, selectedTool, getRelativePos, onMouseMove, scheduleEraseBatch]
  );

  const handlePointerUp = useCallback(
    (e: any) => {
      const evt = e.evt;
      if (evt.pointerType === "pen") {
        isPenInUseRef.current = false;
      }
      if (evt.pointerType === "touch" && isPenInUseRef.current) return;

      // Clear eraser mode and flush any remaining erase batch
      isErasingRef.current = false;
      if (eraseBatchRef.current.size > 0) {
        eraseRafPendingRef.current = false;
        processEraseBatch();
      }

      if (!isDrawing || selectedTool === "select" || selectedTool === "pan") {
        // After panning, sync the viewport to other users
        if (selectedTool === "pan") {
          broadcastViewport();
        }
        setIsDrawing(false);
        setDrawStart(null);
        setDrawCurrent(null);
        penPointsRef.current = [];
        return;
      }

      const pos = drawCurrent || getRelativePos(e);

      // Pen/freehand drawing with pressure support
      if (selectedTool === "pen") {
        const pts = penPointsRef.current;
        if (pts.length > 2) {
          const xs = pts.map((p) => p.x);
          const ys = pts.map((p) => p.y);
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
              path: pts.map((p) => ({
                x: p.x - minX,
                y: p.y - minY,
                pressure: p.pressure || 1,
              })),
            } as ShapeData,
          });
        }

        // Clear preview line for next stroke
        penPreviewLineRef.current?.points([]);
        penPreviewLineRef.current?.getLayer()?.batchDraw();

        setIsDrawing(false);
        penPointsRef.current = [];
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
    [isDrawing, drawStart, drawCurrent, selectedTool, getRelativePos, shapes.length, onAddShape, processEraseBatch]
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
    // Cancel any running stage transition (auto-fit/auto-center)
    cancelStageTransition();

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
    // Sync viewport to other users (debounced)
    broadcastViewport();
  }, [cancelStageTransition, broadcastViewport]);

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

  const handleParticlesEnd = useCallback((ids: number[]) => {
    setParticles((prev) => prev.filter((p) => !ids.includes(p.id)));
  }, []);

  // Safety cleanup: remove stale particles after 2 seconds regardless
  useEffect(() => {
    if (particles.length === 0) return;
    const t = setTimeout(() => {
      setParticles([]);
    }, 2000);
    return () => clearTimeout(t);
  }, [particles.length]);

  const getDrawPreview = () => {
    if (!isDrawing || selectedTool === "select" || selectedTool === "pan") return null;

    // Pen preview is handled via direct Konva manipulation through penPreviewLineRef
    if (selectedTool === "pen") return null;

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

          {/* Pen preview — updated directly via ref for low-latency Apple Pencil */}
          <KonvaLine
            ref={penPreviewLineRef}
            points={[]}
            stroke="#6366f1"
            strokeWidth={3}
            lineCap="round"
            lineJoin="round"
            tension={0.3}
            listening={false}
          />

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
              isEraserHovered={selectedTool === "eraser" && shape.id === hoveredShapeId}
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

      {/* Erase particle effects */}
      <ParticleOverlay particles={particles} onParticlesEnd={handleParticlesEnd} />

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
