import { pgTable, text, timestamp, jsonb, uuid, integer, index } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const notificationLogs = pgTable(
  "notification_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    adminId: text("admin_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    url: text("url"),
    targetUserIds: jsonb("target_user_ids").$type<string[] | null>(),
    sentCount: integer("sent_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("notification_logs_created_at_idx").on(table.createdAt)],
);
