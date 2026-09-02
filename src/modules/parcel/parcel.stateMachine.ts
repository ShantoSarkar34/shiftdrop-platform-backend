import { ParcelStatus } from "../../../generated/prisma";

const TRANSITIONS: Record<ParcelStatus, ParcelStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["ASSIGNED", "CANCELLED"],
  ASSIGNED: ["PICKED_UP", "CONFIRMED"],
  PICKED_UP: ["IN_TRANSIT", "FAILED_DELIVERY"],
  IN_TRANSIT: ["OUT_FOR_DELIVERY", "FAILED_DELIVERY"],
  OUT_FOR_DELIVERY: ["DELIVERED", "FAILED_DELIVERY"],
  FAILED_DELIVERY: ["OUT_FOR_DELIVERY", "RETURNED"],
  DELIVERED: [],
  CANCELLED: [],
  RETURNED: [],
};

export const isValidTransition = (
  from: ParcelStatus,
  to: ParcelStatus,
): boolean => {
  return TRANSITIONS[from]?.includes(to) ?? false;
};

export const getAllowedNextStatuses = (from: ParcelStatus): ParcelStatus[] => {
  return TRANSITIONS[from] ?? [];
};
