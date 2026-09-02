import { Request, Response, NextFunction } from "express";
import { Role } from "../../generated/prisma";
import { ApiError } from "../modules/auth/auth.service";

export const authorize = (...allowedRoles: Role[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new ApiError(401, "Authentication required"));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new ApiError(403, "You do not have permission to perform this action"),
      );
    }

    next();
  };
};
