import { Hono } from "hono";
import { tripsRouter } from "./trips.routes";
import { usersRouter } from "./users.routes";
import { leaderboardRouter } from "./leaderboard.routes";
import { statsRouter } from "./stats.routes";
import { achievementsRouter } from "./achievements.routes";
import { fuelPriceRouter } from "./fuel-price.routes";
import { pushRouter } from "./push.routes";
import type { AuthEnv } from "../types/context";

const apiRouter = new Hono<AuthEnv>();

apiRouter.route("/trips", tripsRouter);
apiRouter.route("/user", usersRouter);
apiRouter.route("/stats/leaderboard", leaderboardRouter);
apiRouter.route("/stats", statsRouter);
apiRouter.route("/achievements", achievementsRouter);
apiRouter.route("/fuel-price", fuelPriceRouter);
apiRouter.route("/push", pushRouter);

export { apiRouter };
