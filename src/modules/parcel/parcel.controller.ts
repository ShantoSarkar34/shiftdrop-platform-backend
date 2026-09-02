import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { parcelService } from "./parcel.service";
import { ApiError } from "../../modules/auth/auth.service";

export const parcelController = {
  create: catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, "Authentication required");
    const parcel = await parcelService.create(req.user.userId, req.body);
    sendResponse(res, 201, {
      success: true,
      message: "Shipment created successfully",
      data: parcel,
    });
  }),

  list: catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, "Authentication required");
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const result = await parcelService.list(req.user.userId, req.user.role, page, limit);
    sendResponse(res, 200, {
      success: true,
      message: "Shipments retrieved successfully",
      data: result.parcels,
      meta: result.meta,
    });
  }),

  getById: catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, "Authentication required");
    const parcelId = req.params.id as string;
    const parcel = await parcelService.getById(req.user.userId, req.user.role, parcelId);
    sendResponse(res, 200, {
      success: true,
      message: "Shipment retrieved successfully",
      data: parcel,
    });
  }),

  cancel: catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, "Authentication required");
    const parcelId = req.params.id as string;
    const parcel = await parcelService.cancel(req.user.userId, parcelId);
    sendResponse(res, 200, {
      success: true,
      message: "Shipment cancelled successfully",
      data: parcel,
    });
  }),
};