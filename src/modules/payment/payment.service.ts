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
      success_url: `${env.CLIENT_URL}/payment/success?parcelId=${parcel.id}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.CLIENT_URL}/payment/cancel?parcelId=${parcel.id}`,
      metadata: { parcelId: parcel.id, customerId: customer.id },
    });

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
    console.log(
      "[webhook] received, body length:",
      rawBody?.length,
      "signature present:",
      !!signature,
    );

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        rawBody,
        signature,
        env.STRIPE_WEBHOOK_SECRET,
      );
    } catch (err) {
      console.error(
        "[webhook] signature verification failed:",
        err instanceof Error ? err.message : err,
      );
      throw new ApiError(400, `Webhook signature verification failed`);
    }

    // console.log("[webhook] verified event:", event.type, event.id);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log(
          "[webhook] checkout.session.completed — session:",
          session.id,
        );
        await this.markPaid(
          session.id,
          event.id,
          session.payment_intent as string,
        );
        break;
      }
      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log(
          "[webhook] checkout.session.expired — session:",
          session.id,
        );
        await this.markFailed(session.id, event.id);
        break;
      }
      default:
        console.log("[webhook] unhandled event type, ignoring:", event.type);
        break;
    }

    return { received: true };
  },

  async markPaid(
    stripeSessionId: string,
    eventId: string,
    paymentIntentId: string,
    source: "webhook" | "sync" = "webhook",
  ) {
    const payment = await prisma.payment.findUnique({
      where: { stripeCheckoutSessionId: stripeSessionId },
    });

    if (!payment) {
      console.warn("[markPaid] no payment found for session:", stripeSessionId);
      return;
    }
    console.log(
      "[markPaid] found payment:",
      payment.id,
      "current status:",
      payment.status,
    );

    if (payment.lastProcessedEventId === eventId) {
      console.log("[markPaid] event already processed, skipping:", eventId);
      return;
    }
    if (payment.status === "PAID") {
      console.log("[markPaid] payment already PAID, skipping");
      return;
    }

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
        data: { status: "CONFIRMED" },
      });

      await tx.parcelStatusHistory.create({
        data: {
          parcelId: payment.parcelId,
          status: "CONFIRMED",
          changedBy: null,
          note:
            source === "sync"
              ? "Payment confirmed via manual sync"
              : "Payment confirmed via Stripe webhook",
        },
      });

      await logAudit(
        {
          actorId: null,
          action: "PAYMENT_COMPLETED",
          entityType: "Payment",
          entityId: payment.id,
          metadata: { amount: payment.amount, source },
        },
        tx,
      );
    });
  },

  async syncFromStripeSession(userId: string, sessionId: string) {
    const customer = await prisma.customer.findUnique({ where: { userId } });
    if (!customer) throw new ApiError(404, "Customer profile not found");

    const payment = await prisma.payment.findUnique({
      where: { stripeCheckoutSessionId: sessionId },
    });
    if (!payment) throw new ApiError(404, "No payment found for this session");
    if (payment.customerId !== customer.id)
      throw new ApiError(403, "Access denied");

    if (payment.status === "PAID") {
      console.log("[sync] payment already PAID, returning as-is:", payment.id);
      return payment;
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    console.log(
      "[sync] stripe session status:",
      session.payment_status,
      "for session:",
      sessionId,
    );

    if (session.payment_status === "paid") {
      await this.markPaid(
        sessionId,
        `sync_${Date.now()}`,
        session.payment_intent as string,
        "sync",
      );
      return prisma.payment.findUnique({ where: { id: payment.id } });
    }

    if (session.status === "expired") {
      await this.markFailed(sessionId, `sync_${Date.now()}`);
      return prisma.payment.findUnique({ where: { id: payment.id } });
    }

    // Still genuinely pending on Stripe's side — return current (unpaid) state, not an error
    console.log("[sync] payment still pending on Stripe's side");
    return payment;
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
