import Stripe from "stripe";
import { prisma } from "../../lib/prisma";
import { stripe } from "../../lib/stripe";
import { ApiError } from "../../modules/auth/auth.service";
import { env } from "../../config/env";
import { logAudit } from "../../utils/auditLogger";

export const paymentService = {
  async createCheckoutSession(userId: string, parcelId: string) {
    const customer = await prisma.customer.findUnique({ where: { userId } });
    if (!customer) throw new ApiError(404, "Customer profile not found");

    const parcel = await prisma.parcel.findUnique({
      where: { id: parcelId, deletedAt: null },
      include: { payment: true },
    });
    if (!parcel) throw new ApiError(404, "Parcel not found");
    if (parcel.customerId !== customer.id) {
      throw new ApiError(403, "You do not have access to this shipment");
    }
    if (parcel.payment?.status === "PAID") {
      throw new ApiError(409, "This shipment has already been paid for");
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: Math.round(parcel.deliveryCharge * 100), // cents
            product_data: {
              name: `SwiftDrop Delivery — ${parcel.trackingId}`,
              description: `${parcel.pickupCity} → ${parcel.deliveryCity}`,
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${env.CLIENT_URL}/payment-success.html`,
      cancel_url: `${env.CLIENT_URL}/payment-cancelled.html`,
      metadata: { parcelId: parcel.id, customerId: customer.id },
    });

    // Upsert: create the PENDING payment row, or update it if retrying after a previous cancelled attempt
    const payment = await prisma.payment.upsert({
      where: { parcelId: parcel.id },
      update: {
        status: "PENDING",
        stripeCheckoutSessionId: session.id,
        amount: parcel.deliveryCharge,
      },
      create: {
        parcelId: parcel.id,
        customerId: customer.id,
        amount: parcel.deliveryCharge,
        status: "PENDING",
        stripeCheckoutSessionId: session.id,
      },
    });

    return { checkoutUrl: session.url, paymentId: payment.id };
  },

  async handleWebhookEvent(rawBody: Buffer, signature: string) {
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        rawBody,
        signature,
        env.STRIPE_WEBHOOK_SECRET,
      );
    } catch (err) {
      throw new ApiError(400, `Webhook signature verification failed`);
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await this.markPaid(
          session.id,
          event.id,
          session.payment_intent as string,
        );
        break;
      }
      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        await this.markFailed(session.id, event.id);
        break;
      }
      default:
        // Unhandled event types are fine to ignore — Stripe sends many we don't need
        break;
    }

    return { received: true };
  },

  async markPaid(
    stripeSessionId: string,
    eventId: string,
    paymentIntentId: string,
  ) {
    const payment = await prisma.payment.findUnique({
      where: { stripeCheckoutSessionId: stripeSessionId },
    });
    if (!payment) return; // no matching payment — ignore (could be a stale/foreign event)

    if (payment.lastProcessedEventId === eventId) return; // idempotency: already processed
    if (payment.status === "PAID") return; // already paid, ignore duplicate

    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: "PAID",
          stripePaymentIntentId: paymentIntentId,
          lastProcessedEventId: eventId,
        },
      });

      await tx.parcel.update({
        where: { id: payment.parcelId },
        data: { status: "CONFIRMED" }, // payment confirms the shipment, moving it past PENDING
      });

      await tx.parcelStatusHistory.create({
        data: {
          parcelId: payment.parcelId,
          status: "CONFIRMED",
          changedBy: null, // system-triggered, not a specific user
          note: "Payment confirmed via Stripe",
        },
      });

      await logAudit(
        {
          actorId: null,
          action: "PAYMENT_COMPLETED",
          entityType: "Payment",
          entityId: payment.id,
          metadata: { amount: payment.amount },
        },
        tx,
      );
    });
  },

  async markFailed(stripeSessionId: string, eventId: string) {
    const payment = await prisma.payment.findUnique({
      where: { stripeCheckoutSessionId: stripeSessionId },
    });
    if (!payment) return;
    if (payment.lastProcessedEventId === eventId) return;
    if (payment.status === "PAID") return; // never downgrade a successful payment

    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED", lastProcessedEventId: eventId },
    });
  },

  async getByParcel(userId: string, parcelId: string) {
    const customer = await prisma.customer.findUnique({ where: { userId } });
    if (!customer) throw new ApiError(404, "Customer profile not found");

    const payment = await prisma.payment.findUnique({ where: { parcelId } });
    if (!payment) throw new ApiError(404, "No payment found for this shipment");
    if (payment.customerId !== customer.id)
      throw new ApiError(403, "Access denied");

    return payment;
  },

  async listMyPayments(userId: string, page: number, limit: number) {
    const customer = await prisma.customer.findUnique({ where: { userId } });
    if (!customer) throw new ApiError(404, "Customer profile not found");

    const skip = (page - 1) * limit;
    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where: { customerId: customer.id },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.payment.count({ where: { customerId: customer.id } }),
    ]);

    return {
      payments,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  },
};
