import User from "../models/user.js";
import { validateSession } from "../services/sessionService.js";
import { AsyncHandler } from "../utils/AsyncHandler.js";
import { ErrorHandler } from "../utils/ErrorHandler.js";
import jwt from "jsonwebtoken";
export const AuthCheck = AsyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new ErrorHandler("Authentication token is missing or invalid.", 403);
  }
  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SCRECT_KEY);
    const user = await User.findById(decoded._id).select("-password");
    if (!user) throw new ErrorHandler("User not found", 404);
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
});

export const authorizeRole = (...roles) => {
  return AsyncHandler(async (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      throw new ErrorHandler(
        `Role ${req.user.role} is not allowed to access this resource`,
        403
      );
    }
    next();
  });
};

export const SessionCheck = AsyncHandler(async (req, res, next) => {
  const sessionToken = req.headers["x-session-token"];

  if (!sessionToken) {
    throw new ErrorHandler("Session token is required", 403);
  }

  // Validate the session is active
  const isValidSession = await validateSession(req.user._id, sessionToken);

  if (!isValidSession) {
    throw new ErrorHandler(
      "Your session has expired or is invalid. Please login again.",
      401
    );
  }

  req.sessionToken = sessionToken;
  next();
});
