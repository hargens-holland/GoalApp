import { prisma } from "@/lib/prisma";
import { adjustRoadmap } from "@/lib/agents/architect";
import type { AgentOutcome } from "@/lib/agents/client";
import type { Roadmap } from "@/lib/agents/schemas";

/**
 * Ask the Architect to revise a goal's roadmap and replace the milestones.
 * Tasks point at milestones via SetNull, so they survive. The caller decides
 * whether to replan the week afterwards. Shared by the adjust route and the
 * coordinator.
 *
 * The goal must already be known to belong to the caller.
 */
export async function reviseRoadmap(userId: string, goalId: string, request: string): Promise<AgentOutcome<Roadmap>> {
  const goal = await prisma.goal.findUniqueOrThrow({
    where: { id: goalId },
    include: { milestones: { orderBy: { order: "asc" } } },
  });

  const outcome = await adjustRoadmap(
    goal.goal,
    goal.milestones.map((m) => ({ title: m.title, description: m.description ?? "", order: m.order })),
    request,
    { userId }
  );

  await prisma.$transaction([
    prisma.milestone.deleteMany({ where: { goalId: goal.id } }),
    prisma.goal.update({
      where: { id: goal.id },
      data: {
        milestones: {
          create: outcome.data.milestones
            .sort((a, b) => a.order - b.order)
            .map((m, i) => ({
              title: m.title,
              description: m.description,
              successCriteria: m.successCriteria,
              order: i,
              targetWeekOffset: m.targetWeekOffset,
              status: i === 0 ? "active" : "locked",
            })),
        },
      },
    }),
  ]);

  return outcome;
}
