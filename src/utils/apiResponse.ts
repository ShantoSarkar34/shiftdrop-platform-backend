import { Response } from "express";

export function sendSuccess(
  res: Response,
  data: unknown = {},
  message = "Operation successful",
  statusCode = 200
) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
}

export function sendError(
  res: Response,
  message = "Something went wrong",
  statusCode = 500,
  errors: unknown[] = []
) {
  return res.status(statusCode).json({
    success: false,
    message,
    errors,
  });
}