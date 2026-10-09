import { z } from "zod";

export const healthSchema = z.object({
  status: z.literal("ok"),
  service: z.string().min(1),
});

export type Health = z.infer<typeof healthSchema>;
