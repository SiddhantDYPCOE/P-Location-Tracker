
import { z } from "zod";

const coordinatesSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
});

export const startJourneySchema = z.object({
  destinationName: z.string().trim().min(1).max(200),
  destinationLat: z.number().finite().min(-90).max(90),
  destinationLng: z.number().finite().min(-180).max(180),
  startLocation: coordinatesSchema,
});

export const updateJourneyLocationSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
});

