import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../utils/jwt";
import { prisma } from "../lib/prisma";
import { ApiError } from "../modules/auth/auth.service";

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new ApiError(401, "Authentication token is missing");
    }

    const token = authHeader.split(" ")[1];

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      throw new ApiError(401, "Invalid or expired access token");
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
    });

    if (!user || user.deletedAt) {
      throw new ApiError(401, "User no longer exists");
    }
    if (user.status === "SUSPENDED") {
      throw new ApiError(403, "Account suspended");
    }

    req.user = { userId: user.id, role: user.role };
    next();
  } catch (err) {
    next(err);
  }
};
