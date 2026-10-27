
import prisma from "../../db.js";
import { updateJourneyLocation } from "./journey.service.js";
import { updateJourneyLocationSchema } from "./journey.validation.js";


const sendError = (ack, message) => {
  if (typeof ack === "function") {
    ack({ success: false, message });
  }
};

export const registerJourneySocket = (journeyIo) => {
  journeyIo.on("connection", (socket) => {
    const userId = socket.data.userId;

    socket.join(`user:${userId}`);

    socket.on(
      "journey:location-update",
      async (payload = {}, ack) => {
        try {
          const { journeyId, ...coordinates } = payload;

          if (
            typeof journeyId !== "string" ||
            journeyId.trim().length === 0
          ) {
            return sendError(ack, "A valid journey ID is required.");
          }

          const location =
            updateJourneyLocationSchema.parse(coordinates);

          const journey = await updateJourneyLocation(
            userId,
            journeyId,
            location
          );

          // Find only currently accepted friends.
          const friendships = await prisma.friendship.findMany({
            where: {
              status: "ACCEPTED",
              OR: [
                { requesterId: userId },
                { addresseeId: userId },
              ],
            },
            select: {
              requesterId: true,
              addresseeId: true,
            },
          });

          const friendIds = friendships.map((friendship) =>
            friendship.requesterId === userId
              ? friendship.addresseeId
              : friendship.requesterId
          );

          const update = {
            journeyId: journey.id,
            userId,
            latitude: journey.currentLat,
            longitude: journey.currentLng,
            lastLocationAt: journey.lastLocationAt,
          };

          // Send the update only to accepted friends.
          for (const friendId of friendIds) {
            journeyIo.to(`user:${friendId}`).emit(
              "journey:friend-location",
              update
            );
          }

          if (typeof ack === "function") {
            ack({ success: true, journey: update });
          }
        } catch (error) {
          if (error.name === "ZodError") {
            return sendError(ack, "Invalid location coordinates.");
          }

          if (error.statusCode === 404) {
            return sendError(
              ack,
              "Active journey not found or access denied."
            );
          }

          console.error("Journey location socket error:", error);
          sendError(ack, "Unable to update journey location.");
        }
      }
    );
  });
};
