import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { adminService } from "./admin.service";

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
};
