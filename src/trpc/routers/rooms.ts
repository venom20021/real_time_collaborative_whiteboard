import { z } from "zod";
import { router, publicProcedure } from "../init";

export const roomsRouter = router({
  create: publicProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        userName: z.string().min(1).max(50).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = input.userName
        ? await ctx.prisma.user.create({
            data: {
              name: input.userName,
              color: `hsl(${Math.floor(Math.random() * 360)}, 70%, 55%)`,
            },
          })
        : null;

      const room = await ctx.prisma.room.create({
        data: {
          name: input.name,
          ...(user
            ? {
                participants: {
                  create: { userId: user.id },
                },
              }
            : {}),
        },
        include: {
          participants: true,
        },
      });

      return { room, user };
    }),

  list: publicProcedure.query(async ({ ctx }) => {
    return ctx.prisma.room.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { participants: true, shapes: true } },
      },
    });
  }),

  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.room.findUnique({
        where: { id: input.id },
        include: {
          participants: {
            include: { user: true },
          },
          shapes: {
            orderBy: { zIndex: "asc" },
          },
        },
      });
    }),

  join: publicProcedure
    .input(
      z.object({
        roomId: z.string(),
        userName: z.string().min(1).max(50),
        userColor: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Find or create user by name (simplified — no auth yet)
      let user = await ctx.prisma.user.findFirst({
        where: { name: input.userName },
      });

      if (!user) {
        user = await ctx.prisma.user.create({
          data: {
            name: input.userName,
            color: input.userColor ?? `hsl(${Math.floor(Math.random() * 360)}, 70%, 55%)`,
          },
        });
      }

      // Add to room
      await ctx.prisma.roomParticipant.upsert({
        where: {
          roomId_userId: { roomId: input.roomId, userId: user.id },
        },
        update: {},
        create: {
          roomId: input.roomId,
          userId: user.id,
        },
      });

      return user;
    }),

  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.room.delete({ where: { id: input.id } });
      return { success: true };
    }),
});
