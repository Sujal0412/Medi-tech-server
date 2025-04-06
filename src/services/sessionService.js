import User from "../models/user.js";
import crypto from "crypto";

// Generate a secure session token
export const generateSessionToken = () => {
  return crypto.randomBytes(48).toString("hex");
};

// Create a new session for the user
export const createSession = async (user, req) => {
  // Invalidate any existing session
  await invalidateUserSessions(user._id);

  // Generate new session token
  const sessionToken = generateSessionToken();

  // Set expiry to 24 hours from now
  const sessionExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  // Record user agent and IP
  const userAgent = req.headers["user-agent"] || "Unknown";
  const ipAddress = "Unknown";
  // Create login record
  const loginRecord = {
    loginTime: new Date(),
    ipAddress,
    userAgent,
    sessionToken,
  };

  // Update user with new session information
  await User.findByIdAndUpdate(user._id, {
    sessionToken,
    sessionExpiresAt,
    lastLoginAt: new Date(),
    lastLoginIP: ipAddress,
    $push: { loginHistory: loginRecord },
  });

  return {
    sessionToken,
    expiresAt: sessionExpiresAt,
  };
};

// Validate if a session is still active and valid
export const validateSession = async (userId, sessionToken) => {
  const user = await User.findById(userId);

  if (!user) return false;
  if (!user.sessionToken || user.sessionToken !== sessionToken) return false;
  if (user.sessionExpiresAt < new Date()) return false;

  return true;
};

// Invalidate all sessions for a user
export const invalidateUserSessions = async (userId) => {
  const user = await User.findById(userId);

  if (user && user.sessionToken) {
    // If there's an existing session, mark it as logged out
    if (user.loginHistory && user.loginHistory.length > 0) {
      const lastSession = user.loginHistory[user.loginHistory.length - 1];
      if (lastSession && !lastSession.logoutTime) {
        lastSession.logoutTime = new Date();
        user.lastLogoutAt = new Date();
        await user.save();
      }
    }

    // Clear the session token
    user.sessionToken = null;
    user.sessionExpiresAt = null;
    await user.save();
  }
};

// End a specific session
export const endSession = async (userId, sessionToken) => {
  const user = await User.findById(userId);

  if (!user) return false;

  // If session token matches, end the session
  if (user.sessionToken === sessionToken) {
    // Update login history
    if (user.loginHistory && user.loginHistory.length > 0) {
      // Find the session with matching token
      const sessionIndex = user.loginHistory.findIndex(
        (session) => session.sessionToken === sessionToken
      );

      if (sessionIndex !== -1) {
        user.loginHistory[sessionIndex].logoutTime = new Date();
      }
    }

    user.lastLogoutAt = new Date();
    user.sessionToken = null;
    user.sessionExpiresAt = null;
    await user.save();
  }

  return true;
};
