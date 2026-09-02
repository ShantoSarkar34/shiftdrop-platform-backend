import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { paymentService } from "./payment.service";
import { ApiError } from "../../modules/auth/auth.service";

export const paymentController = {
  createCheckout: catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, "Authentication required");
    const parcelId = req.params.parcelId as string;
    const result = await paymentService.createCheckoutSession(
      req.user.userId,
      parcelId,
    );
    sendResponse(res, 201, {
      success: true,
      message: "Checkout session created",
      data: result,
    });
  }),

  webhook: catchAsync(async (req: Request, res: Response) => {
    const signature = req.headers["stripe-signature"] as string;
    const result = await paymentService.handleWebhookEvent(req.body, signature);
    res.status(200).json(result); // Stripe expects a plain 200, not our standard envelope
  }),

  getByParcel: catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, "Authentication required");
    const parcelId = req.params.parcelId as string;
    const payment = await paymentService.getByParcel(req.user.userId, parcelId);
    sendResponse(res, 200, {
      success: true,
      message: "Payment details retrieved",
      data: payment,
    });
  }),

  listMine: catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, "Authentication required");
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const result = await paymentService.listMyPayments(
      req.user.userId,
      page,
      limit,
    );
    sendResponse(res, 200, {
      success: true,
      message: "Payment history retrieved",
      data: result.payments,
      meta: result.meta,
    });
  }),
};
