
import {
  registerSchema,
  loginSchema,
} from "./auth.validation.js";

import {
  registerUser,
  loginUser,
} from "./auth.service.js";
import { clearAuthCookie, setAuthCookie } from "../../middleware/auth.cookie.js";


const sendError = (res, error) => {
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
    console.error("Authentication error:", error);
  }

  return res.status(statusCode).json({
    message:
      statusCode === 500
        ? "An unexpected error occurred."
        : error.message,
  });
};
export const register = async (req, res) => {
  try {
    const input = registerSchema.parse(req.body);
    const result = await registerUser(input);

    setAuthCookie(res, result.token);

    return res.status(201).json({
      message: "Account created successfully.",
      user: result.user,
    });
  } catch (error) {
    return sendError(res, error);
  }
};

export const login = async (req, res) => {
  try {
    const input = loginSchema.parse(req.body);
    const result = await loginUser(input);

    setAuthCookie(res, result.token);

    return res.status(200).json({
      message: "Login successful.",
      user: result.user,
    });
  } catch (error) {
    return sendError(res, error);
  }
};

export const logout = (req, res) => {
  clearAuthCookie(res);

  return res.json({
    message: "Logged out successfully.",
  });
};