import { Response } from "express";

interface ApiResponsePayload<T> {
  success: boolean;
  message: string;
  data?: T;
  errors?: unknown[];
  meta?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export const sendResponse = <T>(
  res: Response,
  statusCode: number,
  payload: ApiResponsePayload<T>,
) => {
  return res.status(statusCode).json(payload);
};
