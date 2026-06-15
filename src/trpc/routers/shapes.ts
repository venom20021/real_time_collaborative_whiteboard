import { z } from "zod";
import { router, publicProcedure } from "../init";

const shapeTypeSchema = z.enum([
  "rect",
  "circle",
  "line",
  "text",
  "arrow",
  "image",
  "path",
]);

const shapeDataSchema = z.object({
  text: z.string().optional(),
  path: z.array(z.object({ x: z.number(), y: z.number() })).optional(),
  points: z.array(z.number()).optional(),
  src: z.string().optional(),
  borderRadius: z.number().optional(),
});

export const shapesRouter = router({
  create: publicProcedure
    .input(
      z.object({
        roomId: z.string(),
        type: shapeTypeSchema,
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number(),
        fill: z.string().optional(),
        stroke: z.string().optional(),
        strokeWidth: z.number().optional(),
        rotation: z.number().optional(),
        opacity: z.number().optional(),
        zIndex: z.number().optional(),
        data: shapeDataSchema.optional(),
        createdBy: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const shape = await ctx.prisma.shape.create({
        data: {
          roomId: input.roomId,
          type: input.type,
          x: input.x,
          y: input.y,
          width: input.width,
          height: input.height,
          fill: input.fill ?? "#6366f1",
          stroke: input.stroke ?? "#000000",
          strokeWidth: input.strokeWidth ?? 2,
          rotation: input.rotation ?? 0,
          opacity: input.opacity ?? 1,
          zIndex: input.zIndex ?? 0,
          data: input.data ? JSON.stringify(input.data) : null,
          createdBy: input.createdBy ?? null,
        },
      });

      return {
        ...shape,
        data: shape.data ? JSON.parse(shape.data) : null,
      };
    }),

  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        x: z.number().optional(),
        y: z.number().optional(),
        width: z.number().optional(),
        height: z.number().optional(),
        fill: z.string().optional(),
        stroke: z.string().optional(),
        strokeWidth: z.number().optional(),
        rotation: z.number().optional(),
        opacity: z.number().optional(),
        zIndex: z.number().optional(),
        data: shapeDataSchema.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, data, ...fields } = input;
      const shape = await ctx.prisma.shape.update({
        where: { id },
        data: {
          ...fields,
          ...(data !== undefined ? { data: JSON.stringify(data) } : {}),
        },
      });

      return {
        ...shape,
        data: shape.data ? JSON.parse(shape.data) : null,
      };
    }),

  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.shape.delete({ where: { id: input.id } });
      return { success: true };
    }),

  listByRoom: publicProcedure
    .input(z.object({ roomId: z.string() }))
    .query(async ({ ctx, input }) => {
      const shapes = await ctx.prisma.shape.findMany({
        where: { roomId: input.roomId },
        orderBy: { zIndex: "asc" },
      });

      return shapes.map((shape) => ({
        ...shape,
        data: shape.data ? JSON.parse(shape.data) : null,
      }));
    }),

  batchUpdate: publicProcedure
    .input(
      z.object({
        roomId: z.string(),
        shapes: z.array(
          z.object({
            id: z.string(),
            type: shapeTypeSchema,
            x: z.number(),
            y: z.number(),
            width: z.number(),
            height: z.number(),
            fill: z.string(),
            stroke: z.string(),
            strokeWidth: z.number(),
            rotation: z.number(),
            opacity: z.number(),
            zIndex: z.number(),
            data: z.string().nullable(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Delete all existing shapes for the room and re-insert
      // Used for full state sync from Yjs
      await ctx.prisma.shape.deleteMany({ where: { roomId: input.roomId } });

      if (input.shapes.length > 0) {
        await ctx.prisma.shape.createMany({
          data: input.shapes.map((s) => ({
            ...s,
            roomId: input.roomId,
          })),
        });
      }

      return { success: true, count: input.shapes.length };
    }),
});
