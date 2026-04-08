import { z } from "zod";
import { FUEL_TYPES, WEEK_DAYS, type Super73Mode } from "@ecoride/shared/types";
import { isValidIanaTimezone } from "../lib/timezone";

const SUPER73_MODES = ["eco", "tour", "sport", "race"] as const satisfies readonly Super73Mode[];

export const updateUserSchema = z.object({
  vehicleModel: z.string().max(100).optional(),
  fuelType: z.enum(FUEL_TYPES as unknown as [string, ...string[]]).optional(),
  consumptionL100: z.number().positive().max(50).optional(),
  mileage: z.number().int().nonnegative().optional(),
  timezone: z.string().refine(isValidIanaTimezone, "Invalid IANA timezone").optional(),
  leaderboardOptOut: z.boolean().optional(),
  reminderEnabled: z.boolean().optional(),
  reminderTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Must be HH:MM format")
    .optional(),
  reminderDays: z.array(z.enum(WEEK_DAYS as unknown as [string, ...string[]])).optional(),
  super73Enabled: z.boolean().optional(),
  super73AutoModeEnabled: z.boolean().optional(),
  super73DefaultMode: z.enum(SUPER73_MODES).nullable().optional(),
  super73DefaultAssist: z.number().int().min(0).max(4).nullable().optional(),
  super73DefaultLight: z.boolean().nullable().optional(),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
