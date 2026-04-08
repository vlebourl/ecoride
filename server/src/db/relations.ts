import { relations } from "drizzle-orm";
import { user, session, account } from "./schema/auth";
import { trips } from "./schema/trips";
import { achievements } from "./schema/achievements";
import { pushSubscriptions } from "./schema/push-subscriptions";
import { tripPresets } from "./schema/trip-presets";
export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  trips: many(trips),
  achievements: many(achievements),
  pushSubscriptions: many(pushSubscriptions),
  tripPresets: many(tripPresets),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

export const tripsRelations = relations(trips, ({ one }) => ({
  user: one(user, { fields: [trips.userId], references: [user.id] }),
}));

export const achievementsRelations = relations(achievements, ({ one }) => ({
  user: one(user, { fields: [achievements.userId], references: [user.id] }),
}));

export const pushSubscriptionsRelations = relations(pushSubscriptions, ({ one }) => ({
  user: one(user, { fields: [pushSubscriptions.userId], references: [user.id] }),
}));

export const tripPresetsRelations = relations(tripPresets, ({ one }) => ({
  user: one(user, { fields: [tripPresets.userId], references: [user.id] }),
  sourceTrip: one(trips, { fields: [tripPresets.sourceTripId], references: [trips.id] }),
}));
