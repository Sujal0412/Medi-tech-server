import jwt from "jsonwebtoken";

export const genrateToken = (user) => {
  return jwt.sign({ _id: user._id }, process.env.JWT_SCRECT_KEY, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};
