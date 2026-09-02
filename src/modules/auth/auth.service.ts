import bcrypt from "bcryptjs";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../../utils/jwt";
import { prisma } from "../../lib/prisma";
import { env } from "../../config/env";

interface RegisterInput {
  name: string;
  email: string;
  password: string;
  role: "CUSTOMER" | "DELIVERY_AGENT";
  phone?: string;
}

interface LoginInput {
  email: string;
  password: string;
}

class ApiError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

const msToDate = (expiresIn: string): Date => {
  const match = expiresIn.match(/^(\d+)([smhd])$/);
  if (!match) throw new Error("Invalid expiresIn format");
  const [, value, unit] = match;
  const num = Number(value);
  const multiplier = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[unit]!;
  return new Date(Date.now() + num * multiplier);
};

export const authService = {
  async register(input: RegisterInput) {
    const existing = await prisma.user.findUnique({
      where: { email: input.email },
    });
    if (existing) throw new ApiError(409, "Email is already registered");

    const hashedPassword = await bcrypt.hash(input.password, 12);

    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          name: input.name,
          email: input.email,
          password: hashedPassword,
          phone: input.phone,
          role: input.role,
          provider: "LOCAL",
        },
      });

      if (input.role === "CUSTOMER") {
        await tx.customer.create({ data: { userId: newUser.id } });
      } else if (input.role === "DELIVERY_AGENT") {
        await tx.deliveryAgent.create({ data: { userId: newUser.id } });
      }

      return newUser;
    });

    return this.issueTokens(user.id, user.role);
  },

  async login(input: LoginInput) {
    const user = await prisma.user.findUnique({
      where: { email: input.email },
    });
    if (!user || !user.password)
      throw new ApiError(401, "Invalid email or password");
    if (user.deletedAt) throw new ApiError(401, "Invalid email or password");
    if (user.status === "SUSPENDED")
      throw new ApiError(403, "Account suspended");

    const isMatch = await bcrypt.compare(input.password, user.password);
    if (!isMatch) throw new ApiError(401, "Invalid email or password");

    return this.issueTokens(user.id, user.role);
  },

  async refresh(refreshToken: string) {
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw new ApiError(401, "Invalid or expired refresh token");
    }

    const stored = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
    });
    if (!stored || stored.revoked || stored.expiresAt < new Date()) {
      throw new ApiError(401, "Refresh token is no longer valid");
    }

    // rotate: revoke old, issue new
    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revoked: true },
    });

    return this.issueTokens(payload.userId, payload.role);
  },

  async logout(refreshToken: string) {
    await prisma.refreshToken.updateMany({
      where: { token: refreshToken },
      data: { revoked: true },
    });
  },

  async issueTokens(
    userId: string,
    role: "CUSTOMER" | "DELIVERY_AGENT" | "ADMIN",
  ) {
    const payload = { userId, role };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId,
        expiresAt: msToDate(env.JWT_REFRESH_EXPIRES_IN),
      },
    });

    return { accessToken, refreshToken };
  },
};

export { ApiError };
