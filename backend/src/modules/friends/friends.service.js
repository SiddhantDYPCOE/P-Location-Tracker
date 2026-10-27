
import prisma from "../../db.js";

const fail = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
};

const userSummary = {
  id: true,
  name: true,
  email: true,
};

export const sendFriendRequest = async (userId, email) => {
  const target = await prisma.user.findUnique({
    where: { email },
    select: userSummary,
  });

  if (!target) {
    fail("No account found with that email address.", 404);
  }

  if (target.id === userId) {
    fail("You cannot send a friend request to yourself.");
  }

  const existing = await prisma.friendship.findMany({
    where: {
      OR: [
        { requesterId: userId, addresseeId: target.id },
        { requesterId: target.id, addresseeId: userId },
      ],
    },
  });

  const accepted = existing.find(
    (friendship) => friendship.status === "ACCEPTED"
  );

  if (accepted) {
    fail("You are already friends with this user.", 409);
  }

  const incoming = existing.find(
    (friendship) =>
      friendship.status === "PENDING" &&
      friendship.requesterId === target.id
  );

  if (incoming) {
    fail(
      "This user has already sent you a request. Accept their incoming request instead.",
      409
    );
  }

  const outgoing = existing.find(
    (friendship) =>
      friendship.status === "PENDING" &&
      friendship.requesterId === userId
  );

  if (outgoing) {
    fail("You have already sent a friend request.", 409);
  }

  // Remove old rejected records so either person can send a fresh request.
  if (existing.length > 0) {
    await prisma.friendship.deleteMany({
      where: {
        OR: [
          { requesterId: userId, addresseeId: target.id },
          { requesterId: target.id, addresseeId: userId },
        ],
        status: "REJECTED",
      },
    });
  }

  return prisma.friendship.create({
    data: {
      requesterId: userId,
      addresseeId: target.id,
      status: "PENDING",
    },
    include: {
      addressee: { select: userSummary },
    },
  });
};

export const getFriendRequests = async (userId) => {
  const [incoming, outgoing] = await Promise.all([
    prisma.friendship.findMany({
      where: {
        addresseeId: userId,
        status: "PENDING",
      },
      include: {
        requester: { select: userSummary },
      },
      orderBy: { createdAt: "desc" },
    }),

    prisma.friendship.findMany({
      where: {
        requesterId: userId,
        status: "PENDING",
      },
      include: {
        addressee: { select: userSummary },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return { incoming, outgoing };
};

export const respondToFriendRequest = async (
  userId,
  friendshipId,
  decision
) => {
  const friendship = await prisma.friendship.findUnique({
    where: { id: friendshipId },
  });
  
  if (!friendship || friendship.addresseeId !== userId) {
    fail("Friend request not found.", 404);
  }

  if (friendship.status !== "PENDING") {
    fail("This friend request has already been handled.", 409);
  }

  return prisma.friendship.update({
    where: { id: friendshipId },
    data: {
      status: decision === "accept" ? "ACCEPTED" : "REJECTED",
    },
    include: {
      requester: { select: userSummary },
      addressee: { select: userSummary },
    },
  });
};

export const getFriends = async (userId) => {
  const friendships = await prisma.friendship.findMany({
    where: {
      status: "ACCEPTED",
      OR: [
        { requesterId: userId },
        { addresseeId: userId },
      ],
    },
    include: {
      requester: { select: userSummary },
      addressee: { select: userSummary },
    },
    orderBy: { updatedAt: "desc" },
  });

  return friendships.map((friendship) => ({
    friendshipId: friendship.id,
    friend:
      friendship.requesterId === userId
        ? friendship.addressee
        : friendship.requester,
    friendsSince: friendship.updatedAt,
  }));
};

export const removeFriend = async (userId, friendshipId) => {
  const friendship = await prisma.friendship.findUnique({
    where: { id: friendshipId },
  });

  if (
    !friendship ||
    friendship.status !== "ACCEPTED" ||
    (friendship.requesterId !== userId &&
      friendship.addresseeId !== userId)
  ) {
    fail("Friendship not found.", 404);
  }

  await prisma.friendship.delete({
    where: { id: friendshipId },
  });

  return { message: "Friend removed successfully." };
};
