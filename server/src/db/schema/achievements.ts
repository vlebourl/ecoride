import { pgTable, text, timestamp, index, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const achievements = pgTable(
  "achievements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    badgeId: text("badge_id").notNull(),
    unlockedAt: timestamp("unlocked_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("achievements_user_id_idx").on(table.userId),
    uniqueIndex("achievements_user_badge_idx").on(table.userId, table.badgeId),
  ],
);
