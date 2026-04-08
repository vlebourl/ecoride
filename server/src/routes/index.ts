import { Hono } from "hono";
import { tripsRouter } from "./trips.routes";
import { tripPresetsRouter } from "./trip-presets.routes";
import { usersRouter } from "./users.routes";
import { leaderboardRouter } from "./leaderboard.routes";
import { statsRouter } from "./stats.routes";
import { achievementsRouter } from "./achievements.routes";
import { fuelPriceRouter } from "./fuel-price.routes";
import { pushRouter } from "./push.routes";
import { adminRouter } from "./admin.routes";
import { feedbackRouter } from "./feedback.routes";
import { healthRouter } from "./health.routes";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { announcements } from "../db/schema";
import type { AuthEnv } from "../types/context";

const apiRouter = new Hono<AuthEnv>();

// Public: get the current active announcement (no auth required)
apiRouter.get("/announcements/active", async (c) => {
  const [active] = await db
    .select()
    .from(announcements)
    .where(eq(announcements.active, true))
    .limit(1);

  return c.json({
    ok: true,
    data: {
      announcement: active ? { ...active, createdAt: active.createdAt.toISOString() } : null,
    },
  });
});

apiRouter.route("/health", healthRouter);
apiRouter.route("/trips", tripsRouter);
apiRouter.route("/trip-presets", tripPresetsRouter);
apiRouter.route("/user", usersRouter);
apiRouter.route("/stats/leaderboard", leaderboardRouter);
apiRouter.route("/stats", statsRouter);
apiRouter.route("/achievements", achievementsRouter);
apiRouter.route("/fuel-price", fuelPriceRouter);
apiRouter.route("/push", pushRouter);
apiRouter.route("/admin", adminRouter);
apiRouter.route("/feedback", feedbackRouter);

export { apiRouter };
