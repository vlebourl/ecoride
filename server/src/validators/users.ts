import { z } from "zod";
import { FUEL_TYPES, WEEK_DAYS } from "@ecoride/shared/types";

export const updateUserSchema = z.object({
  vehicleModel: z.string().max(100).optional(),
  fuelType: z.enum(FUEL_TYPES as unknown as [string, ...string[]]).optional(),
  consumptionL100: z.number().positive().max(50).optional(),
  mileage: z.number().int().nonnegative().optional(),
  leaderboardOptOut: z.boolean().optional(),
  reminderEnabled: z.boolean().optional(),
  reminderTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Must be HH:MM format")
    .optional(),
  reminderDays: z.array(z.enum(WEEK_DAYS as unknown as [string, ...string[]])).optional(),
  super73Enabled: z.boolean().optional(),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
