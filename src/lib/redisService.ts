import { Redis } from "@upstash/redis";
import { env } from "../config/env";

const redis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL!,
  token: env.UPSTASH_REDIS_REST_TOKEN!,
});

export const redisService = {
  set: (key: string, value: string, ttlSeconds?: number) =>
    ttlSeconds
      ? redis.set(key, value, { ex: ttlSeconds })
      : redis.set(key, value),
  get: (key: string) => redis.get<string>(key),
  ttl: (key: string) => redis.ttl(key),
  delete: (key: string) => redis.del(key),
};
