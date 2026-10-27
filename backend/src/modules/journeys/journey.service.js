
import prisma from "../../db.js";

export const startJourney = async (userId, input) => {
  const {
    destinationName,
    destinationLat,
    destinationLng,
    startLocation,
  } = input;

  // Prevent multiple active journeys for the same user.
  const existingJourney = await prisma.journey.findFirst({
    where: {
      userId,
      status: "ACTIVE",
    },
    select: {
      id: true,
    },
  });

  if (existingJourney) {
    const error = new Error(
      "You already have an active journey. Complete or cancel it first."
    );
    error.statusCode = 409;
    throw error;
  }

  return prisma.$transaction(async (tx) => {
    const journey = await tx.journey.create({
      data: {
        userId,
        destinationName,
        destinationLat,
        destinationLng,
        startLat: startLocation.latitude,
        startLng: startLocation.longitude,
        currentLat: startLocation.latitude,
        currentLng: startLocation.longitude,
        lastLocationAt: new Date(),
        status: "ACTIVE",
      },
    });

    await tx.journeyEvent.create({
      data: {
        journeyId: journey.id,
        actorId: userId,
        type: "JOURNEY_STARTED",
        message: `Started a journey to ${destinationName}.`,
        metadata: {
          destinationName,
          destinationLat,
          destinationLng,
          startLat: startLocation.latitude,
          startLng: startLocation.longitude,
        },
      },
    });

    return journey;
  });
};


export const getActiveJourney = async (userId) => {
  return prisma.journey.findFirst({
    where: {
      userId,
      status: "ACTIVE",
    },
    orderBy: {
      startedAt: "desc",
    },
  });
};

export const updateJourneyLocation = async (
  userId,
  journeyId,
  location
) => {
  const journey = await prisma.journey.findFirst({
    where: {
      id: journeyId,
      userId,
      status: "ACTIVE",
    },
    select: {
      id: true,
    },
  });

  if (!journey) {
    const error = new Error(
      "Active journey not found or you do not have permission to update it."
    );
    error.statusCode = 404;
    throw error;
  }

  return prisma.journey.update({
    where: {
      id: journey.id,
    },
    data: {
      currentLat: location.latitude,
      currentLng: location.longitude,
      lastLocationAt: new Date(),
    },
  });
};


export const endJourney = async (userId, journeyId, action) => {
  const status = action === "complete" ? "COMPLETED" : "CANCELLED";

  const eventType =
    action === "complete"
      ? "JOURNEY_COMPLETED"
      : "JOURNEY_CANCELLED";

  return prisma.$transaction(async (tx) => {
    const journey = await tx.journey.findFirst({
      where: {
        id: journeyId,
        userId,
        status: "ACTIVE",
      },
    });

    if (!journey) {
      const error = new Error(
        "Active journey not found or you do not have permission to end it."
      );
      error.statusCode = 404;
      throw error;
    }

    const updatedJourney = await tx.journey.update({
      where: { id: journey.id },
      data: {
        status,
        endedAt: new Date(),
      },
    });

    await tx.journeyEvent.create({
      data: {
        journeyId: journey.id,
        actorId: userId,
        type: eventType,
        message:
          action === "complete"
            ? "Journey completed."
            : "Journey cancelled.",
        metadata: {
          destinationName: journey.destinationName,
        },
      },
    });

    return updatedJourney;
  });
};


export const getFriendsActiveJourneys = async (userId) => {
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

  if (friendIds.length === 0) {
    return [];
  }

  return prisma.journey.findMany({
    where: {
      userId: { in: friendIds },
      status: "ACTIVE",
    },
    select: {
      id: true,
      userId: true,
      destinationName: true,
      destinationLat: true,
      destinationLng: true,
      startLat: true,
      startLng: true,
      currentLat: true,
      currentLng: true,
      lastLocationAt: true,
      startedAt: true,
      user: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: {
      startedAt: "desc",
    },
  });
};
