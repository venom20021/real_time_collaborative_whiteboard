"use client";

import { useState, useEffect } from "react";
import { Rect, Line, Text, Ellipse, Group, Image as KonvaImage } from "react-konva";
import type { Shape } from "@/types/shared";

interface ShapeRendererProps {
  shape: Shape;
  isSelected: boolean;
  isEraserHovered?: boolean;
  onSelect: () => void;
  onDoubleClick: () => void;
  onDragEnd: (x: number, y: number) => void;
  onTransformEnd: (attrs: Partial<Shape>) => void;
}

export function ShapeRenderer({
  shape,
  isSelected,
  isEraserHovered,
  onSelect,
  onDoubleClick,
  onDragEnd,
  onTransformEnd,
}: ShapeRendererProps) {
  const isLineOrArrow = shape.type === "line" || shape.type === "arrow";

  const commonProps = {
    id: shape.id,
    x: isLineOrArrow ? 0 : shape.x,
    y: isLineOrArrow ? 0 : shape.y,
    rotation: shape.rotation,
    opacity: shape.opacity,
    draggable: true,
    onClick: onSelect,
    onTap: onSelect,
    onDragEnd: (e: any) => {
      onDragEnd(e.target.x(), e.target.y());
    },
    onTransformEnd: (e: any) => {
      const node = e.target;
      onTransformEnd({
        x: node.x(),
        y: node.y(),
        rotation: node.rotation(),
        width: node.width() * node.scaleX(),
        height: node.height() * node.scaleY(),
      });
    },
  };

  const strokeColor = shape.stroke || "#000000";
  const fillColor = shape.fill || "transparent";
  const strokeW = shape.strokeWidth || 2;

  const renderShape = () => {
    switch (shape.type) {
      case "rect":
        return (
          <Rect
            {...commonProps}
            width={shape.width}
            height={shape.height}
            fill={fillColor}
            stroke={strokeColor}
            strokeWidth={strokeW}
            cornerRadius={shape.data?.borderRadius || 0}
          />
        );

      case "circle":
        return (
          <Ellipse
            {...commonProps}
            radiusX={Math.max(shape.width, 1) / 2}
            radiusY={Math.max(shape.height, 1) / 2}
            fill={fillColor}
            stroke={strokeColor}
            strokeWidth={strokeW}
          />
        );

      case "line": {
        const points = shape.data?.points || [0, 0, shape.width, shape.height];
        return (
          <Line
            id={shape.id}
            x={0}
            y={0}
            points={points}
            stroke={strokeColor}
            strokeWidth={strokeW}
            lineCap="round"
            lineJoin="round"
            tension={0.5}
            draggable={true}
            onClick={onSelect}
            onTap={onSelect}
            onDragEnd={(e: any) => {
              const newX = shape.x + e.target.x();
              const newY = shape.y + e.target.y();
              onDragEnd(newX, newY);
              e.target.x(0);
              e.target.y(0);
            }}
          />
        );
      }

      case "arrow": {
        const points = shape.data?.points || [0, 0, shape.width, 0];
        return <ArrowShape id={shape.id} points={points} strokeColor={strokeColor} strokeW={strokeW} onSelect={onSelect} onDragEnd={(dx, dy) => {
          onDragEnd(shape.x + dx, shape.y + dy);
        }} />;
      }

      case "text":
        return (
          <Text
            {...commonProps}
            text={shape.data?.text || "Text"}
            fontSize={20}
            fill={fillColor || "#000000"}
            width={shape.width}
            height={shape.height}
            onDblClick={onDoubleClick}
            onDblTap={onDoubleClick}
          />
        );

      case "path": {
        const data = shape.data?.path;
        if (!data || data.length === 0) return null;
        return (
          <Line
            {...commonProps}
            points={data.flatMap((p) => [p.x, p.y])}
            stroke={strokeColor}
            strokeWidth={strokeW}
            lineCap="round"
            lineJoin="round"
            tension={0.3}
            closed={false}
          />
        );
      }

      case "image": {
        return <ImageShapeRenderer shape={shape} commonProps={commonProps} />;
      }

      default:
        return (
          <Rect
            {...commonProps}
            width={shape.width}
            height={shape.height}
            fill={fillColor}
            stroke={strokeColor}
            strokeWidth={strokeW}
          />
        );
    }
  };

  // Selection indicator bounds for lines/arrows
  const getSelectionRect = () => {
    if (shape.type === "line" || shape.type === "arrow") {
      const pts = shape.data?.points || [0, 0, shape.width, shape.height];
      const minX = Math.min(pts[0], pts[2]);
      const minY = Math.min(pts[1], pts[3]);
      const maxX = Math.max(pts[0], pts[2]);
      const maxY = Math.max(pts[1], pts[3]);
      return { x: minX - 5, y: minY - 5, w: maxX - minX + 10, h: maxY - minY + 10 };
    }
    return { x: -5, y: -5, w: shape.width + 10, h: shape.height + 10 };
  };

  const sel = getSelectionRect();

  return (
    <Group
      x={isLineOrArrow ? shape.x : 0}
      y={isLineOrArrow ? shape.y : 0}
    >
      {renderShape()}

      {/* Selection indicator */}
      {isSelected && (
        <Rect
          x={sel.x}
          y={sel.y}
          width={sel.w}
          height={sel.h}
          stroke="#6366f1"
          strokeWidth={2}
          dash={[4, 4]}
          listening={false}
        />
      )}

      {/* Eraser hover highlight */}
      {isEraserHovered && !isSelected && (
        <Rect
          x={sel.x}
          y={sel.y}
          width={sel.w}
          height={sel.h}
          stroke="#ef4444"
          strokeWidth={2.5}
          dash={[6, 3]}
          listening={false}
          shadowColor="#ef4444"
          shadowBlur={8}
          shadowOpacity={0.4}
        />
      )}
    </Group>
  );
}

// ---- Image shape component (loads the image asynchronously) ---- 
function ImageShapeRenderer({
  shape,
  commonProps,
}: {
  shape: Shape;
  commonProps: Record<string, any>;
}) {
  const [imageEl, setImageEl] = useState<HTMLImageElement | null>(null);
  const src = shape.data?.src;

  useEffect(() => {
    if (!src) return;
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => setImageEl(img);
    img.onerror = () => console.error("[image] Failed to load:", src);
    img.src = src;
  }, [src]);

  if (!imageEl) {
    // Placeholder while loading
    return (
      <Rect
        {...commonProps}
        width={shape.width || 100}
        height={shape.height || 100}
        fill="#e5e7eb"
        stroke="#9ca3af"
        strokeWidth={1}
        dash={[4, 4]}
      />
    );
  }

  return (
    <KonvaImage
      {...commonProps}
      image={imageEl}
      width={shape.width || imageEl.width}
      height={shape.height || imageEl.height}
    />
  );
}

// ---- Inline Arrow component ----
function ArrowShape({
  id,
  points,
  strokeColor,
  strokeW,
  onSelect,
  onDragEnd,
}: {
  id: string;
  points: number[];
  strokeColor: string;
  strokeW: number;
  onSelect: () => void;
  onDragEnd: (dx: number, dy: number) => void;
}) {
  if (points.length < 4) return null;

  const [x1, y1, x2, y2] = points;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const angle = Math.atan2(dy, dx);
  const headLen = 10;
  const headHalf = 5;
  const headAngle = Math.PI / 6;

  const p1x = x2 - headLen * Math.cos(angle - headAngle);
  const p1y = y2 - headLen * Math.sin(angle - headAngle);
  const p2x = x2 - headLen * Math.cos(angle + headAngle);
  const p2y = y2 - headLen * Math.sin(angle + headAngle);

  return (
    <Group
      id={id}
      draggable={true}
      onClick={onSelect}
      onTap={onSelect}
      onDragEnd={(e: any) => {
        onDragEnd(e.target.x(), e.target.y());
        e.target.x(0);
        e.target.y(0);
      }}
    >
      <Line
        points={[x1, y1, x2, y2]}
        stroke={strokeColor}
        strokeWidth={strokeW}
        lineCap="round"
      />
      <Line
        points={[x2, y2, p1x, p1y, p2x, p2y, x2, y2]}
        fill={strokeColor}
        stroke={strokeColor}
        strokeWidth={1}
        closed={true}
        listening={false}
      />
    </Group>
  );
}
