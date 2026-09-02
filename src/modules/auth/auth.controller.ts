import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { authService } from "./auth.service";

export const authController = {
  register: catchAsync(async (req: Request, res: Response) => {
    const tokens = await authService.register(req.body);
    sendResponse(res, 201, {
      success: true,
      message: "Registration successful",
      data: tokens,
    });
  }),

  login: catchAsync(async (req: Request, res: Response) => {
    const tokens = await authService.login(req.body);
    sendResponse(res, 200, {
      success: true,
      message: "Login successful",
      data: tokens,
    });
  }),

  googleLogin: catchAsync(async (req: Request, res: Response) => {
    const tokens = await authService.googleLogin(req.body.idToken);
    sendResponse(res, 200, {
      success: true,
      message: "Google login successful",
      data: tokens,
    });
  }),

  refresh: catchAsync(async (req: Request, res: Response) => {
    const tokens = await authService.refresh(req.body.refreshToken);
    sendResponse(res, 200, {
      success: true,
      message: "Token refreshed successfully",
      data: tokens,
    });
  }),

  logout: catchAsync(async (req: Request, res: Response) => {
    await authService.logout(req.body.refreshToken);
    sendResponse(res, 200, {
      success: true,
      message: "Logout successful",
    });
  }),
};
