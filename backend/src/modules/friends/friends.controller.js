
import { sendFriendRequestSchema } from "./friends.validation.js";

import {
  sendFriendRequest,
  getFriendRequests,
  respondToFriendRequest,
  getFriends,
  removeFriend,
} from "./friends.service.js";

const handleError = (res, error) => {
  if (error.name === "ZodError") {
    return res.status(400).json({
      message: "Validation failed.",
      errors: error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  const statusCode = error.statusCode || 500;

  if (statusCode === 500) {
    console.error("Friends error:", error);
  }

  return res.status(statusCode).json({
    message:
      statusCode === 500
        ? "An unexpected error occurred."
        : error.message,
  });
};

export const sendRequest = async (req, res) => {
  try {
    const { email } = sendFriendRequestSchema.parse(req.body);
    const friendship = await sendFriendRequest(req.user.id, email);

    return res.status(201).json({
      message: "Friend request sent successfully.",
      friendship,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

export const listRequests = async (req, res) => {
  try {
    const requests = await getFriendRequests(req.user.id);
    return res.json(requests);
  } catch (error) {
    return handleError(res, error);
  }
};

export const acceptRequest = async (req, res) => {
  try {
    const friendship = await respondToFriendRequest(
      req.user.id,
      req.params.id,
      "accept"
    );

    return res.json({
      message: "Friend request accepted.",
      friendship,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

export const rejectRequest = async (req, res) => {
  try {
    const friendship = await respondToFriendRequest(
      req.user.id,
      req.params.id,
      "reject"
    );

    return res.json({
      message: "Friend request rejected.",
      friendship,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

export const listFriends = async (req, res) => {
  try {
    const friends = await getFriends(req.user.id);
    return res.json({ friends });
  } catch (error) {
    return handleError(res, error);
  }
};

export const deleteFriend = async (req, res) => {
  try {
    const result = await removeFriend(req.user.id, req.params.id);
    return res.json(result);
  } catch (error) {
    return handleError(res, error);
  }
};
