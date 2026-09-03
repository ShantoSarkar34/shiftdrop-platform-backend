import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { adminService } from "./admin.service";
import { ApiError } from "../../modules/auth/auth.service";

export const adminController = {
  listAuditLogs: catchAsync(async (req: Request, res: Response) => {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const filters = {
      action: req.query.action as string | undefined,
      entityType: req.query.entityType as string | undefined,
      actorId: req.query.actorId as string | undefined,
    };
    const result = await adminService.listAuditLogs(filters, page, limit);
    sendResponse(res, 200, {
      success: true,
      message: "Audit logs retrieved successfully",
      data: result.logs,
      meta: result.meta,
    });
  }),

  listUsers: catchAsync(async (req: Request, res: Response) => {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const filters = {
      role: req.query.role as any,
      status: req.query.status as any,
      q: req.query.q as string | undefined,
      sortBy: req.query.sortBy as any,
      sortOrder: req.query.sortOrder as any,
    };
    const result = await adminService.listUsers(filters, page, limit);
    sendResponse(res, 200, {
      success: true,
      message: "Users retrieved successfully",
      data: result.users,
      meta: result.meta,
    });
  }),

  updateUserStatus: catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, "Authentication required");
    const targetUserId = req.params.id as string;
    const updated = await adminService.updateUserStatus(
      req.user.userId,
      targetUserId,
      req.body.status,
    );
    sendResponse(res, 200, {
      success: true,
      message: "User status updated successfully",
      data: updated,
    });
  }),
};
