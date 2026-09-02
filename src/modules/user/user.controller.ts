import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { userService } from "./user.service";
import { ApiError } from "../..//modules/auth/auth.service";

export const userController = {
  getMe: catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, "Authentication required");
    const profile = await userService.getProfile(req.user.userId);
    sendResponse(res, 200, {
      success: true,
      message: "Profile retrieved successfully",
      data: profile,
    });
  }),

  updateMe: catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, "Authentication required");
    const updated = await userService.updateProfile(
      req.user.userId,
      req.user.role,
      req.body,
    );
    sendResponse(res, 200, {
      success: true,
      message: "Profile updated successfully",
      data: updated,
    });
  }),
};
