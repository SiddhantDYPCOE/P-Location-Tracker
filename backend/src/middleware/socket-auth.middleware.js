
import jwt from "jsonwebtoken";

export const authenticateSocket = (socket, next) => {
  try {
    const secret = process.env.JWT_SECRET;

    if (!secret || secret.length < 32) {
      return next(new Error("Authentication is not configured."));
    }

    const cookieHeader = socket.handshake.headers.cookie || "";

    const authCookie = cookieHeader
      .split(";")
      .map((cookie) => cookie.trim())
      .find((cookie) => cookie.startsWith("authToken="));

    if (!authCookie) {
      return next(new Error("Authentication required."));
    }

    const token = decodeURIComponent(
      authCookie.substring("authToken=".length)
    );

    if (!token) {
      return next(new Error("Authentication required."));
    }

    const payload = jwt.verify(token, secret);

    if (
      typeof payload === "string" ||
      typeof payload.sub !== "string"
    ) {
      return next(new Error("Invalid authentication token."));
    }

    socket.data.userId = payload.sub;

    next();
  } catch {
    next(new Error("Invalid or expired authentication token."));
  }
};
