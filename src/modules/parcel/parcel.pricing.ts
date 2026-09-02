import { ServiceType } from "../../../generated/prisma";

const BASE_PRICE: Record<ServiceType, number> = {
  STANDARD: 50,
  EXPRESS: 100,
};

const PER_KG_RATE = 20;
const CROSS_CITY_CHARGE = 30;

export const calculateDeliveryCharge = (
  serviceType: ServiceType,
  weightKg: number,
  pickupCity: string,
  deliveryCity: string,
): number => {
  const base = BASE_PRICE[serviceType];
  const weightCharge = weightKg * PER_KG_RATE;
  const zoneCharge =
    pickupCity.trim().toLowerCase() !== deliveryCity.trim().toLowerCase()
      ? CROSS_CITY_CHARGE
      : 0;

  return Math.round((base + weightCharge + zoneCharge) * 100) / 100;
};
