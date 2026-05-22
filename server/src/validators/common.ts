import { z } from "zod";

export const uuidParam = z.object({
  id: z.string().uuid(),
});

const paginationQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

const dateRangeQuery = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const tripsListQuery = paginationQuery.merge(dateRangeQuery);
