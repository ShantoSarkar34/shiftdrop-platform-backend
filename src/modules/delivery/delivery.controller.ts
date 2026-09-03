import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { deliveryService } from "./delivery.service";
import { ApiError } from "../../modules/auth/auth.service";

export const deliveryController = {
  assign: catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, "Authentication required");
    const parcelId = req.params.parcelId as string;
    const parcel = await deliveryService.assignAgent(
      req.user.userId,
      parcelId,
      req.body.agentId,
    );
    sendResponse(res, 200, {
      success: true,
      message: "Delivery agent assigned successfully",
      data: parcel,
    });
  }),

  accept: catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, "Authentication required");
    const parcelId = req.params.parcelId as string;
    const parcel = await deliveryService.acceptAssignment(
      req.user.userId,
      parcelId,
    );
    sendResponse(res, 200, {
      success: true,
      message: "Assignment accepted",
      data: parcel,
    });
  }),

  reject: catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, "Authentication required");
    const parcelId = req.params.parcelId as string;
    const parcel = await deliveryService.rejectAssignment(
      req.user.userId,
      parcelId,
    );
    sendResponse(res, 200, {
      success: true,
      message: "Assignment rejected",
      data: parcel,
    });
  }),

  pickup: catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, "Authentication required");
    const parcelId = req.params.parcelId as string;
    const parcel = await deliveryService.pickup(req.user.userId, parcelId);
    sendResponse(res, 200, {
      success: true,
      message: "Parcel marked as picked up",
      data: parcel,
    });
  }),

  getMyDeliveries: catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, "Authentication required");
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const status = req.query.status as any;
    const result = await deliveryService.getMyDeliveries(
      req.user.userId,
      page,
      limit,
      status,
    );
    sendResponse(res, 200, {
      success: true,
      message: "Assigned deliveries retrieved successfully",
      data: result.parcels,
      meta: result.meta,
    });
  }),
};
