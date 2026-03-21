import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { achievements } from "../db/schema";
import type { AuthEnv } from "../types/context";

const achievementsRouter = new Hono<AuthEnv>();

// GET /api/achievements — Current user's achievements
achievementsRouter.get("/", async (c) => {
  const currentUser = c.get("user");

  const userAchievements = await db
    .select()
    .from(achievements)
    .where(eq(achievements.userId, currentUser.id));

  return c.json({ ok: true, data: { achievements: userAchievements } });
});

export { achievementsRouter };
