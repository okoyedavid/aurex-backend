import type { WarpDemoRedisClient } from "./warp-demo-session.store.js";

export class MemoryWarpDemoRedis implements WarpDemoRedisClient {
  strings = new Map<string, string>();
  hashes = new Map<string, Record<string, string>>();
  lists = new Map<string, string[]>();
  expirations = new Map<string, number>();
  private purge(key: string) { const expiry = this.expirations.get(key); if (expiry !== undefined && expiry <= Date.now()) { this.strings.delete(key); this.hashes.delete(key); this.lists.delete(key); this.expirations.delete(key); } }
  async set(key: string, value: string, ...args: Array<string | number>) { this.purge(key); if (args.includes("NX") && (this.strings.has(key) || this.hashes.has(key) || this.lists.has(key))) return null; this.strings.set(key, value); const index = args.indexOf("EX"); if (index >= 0) this.expirations.set(key, Date.now() + Number(args[index + 1]) * 1000); return "OK"; }
  async get(key: string) { this.purge(key); return this.strings.get(key) ?? null; }
  async hset(key: string, values: Record<string, string>) { this.purge(key); this.hashes.set(key, { ...(this.hashes.get(key) ?? {}), ...values }); return Object.keys(values).length; }
  async hgetall(key: string) { this.purge(key); return { ...(this.hashes.get(key) ?? {}) }; }
  async hincrby(key: string, field: string, increment: number) { const value = await this.hgetall(key); const next = Number(value[field] ?? 0) + increment; await this.hset(key, { [field]: String(next) }); return next; }
  async rpush(key: string, ...values: string[]) { this.purge(key); const list = this.lists.get(key) ?? []; list.push(...values); this.lists.set(key, list); return list.length; }
  async lrange(key: string, start: number, stop: number) { this.purge(key); const list = this.lists.get(key) ?? []; return list.slice(start, stop === -1 ? undefined : stop + 1); }
  async expire(key: string, seconds: number) { this.purge(key); if (!this.strings.has(key) && !this.hashes.has(key) && !this.lists.has(key)) return 0; this.expirations.set(key, Date.now() + seconds * 1000); return 1; }
  async ttl(key: string) { this.purge(key); if (!this.strings.has(key) && !this.hashes.has(key) && !this.lists.has(key)) return -2; const expiry = this.expirations.get(key); return expiry === undefined ? -1 : Math.max(0, Math.ceil((expiry - Date.now()) / 1000)); }
  async del(...keys: string[]) { let count = 0; for (const key of keys) { count += Number(this.strings.delete(key) || this.hashes.delete(key) || this.lists.delete(key)); this.expirations.delete(key); } return count; }
  async eval(_script: string, _numberOfKeys: number, key: string, expected: string) { if (await this.get(key) !== expected) return 0; return this.del(key); }
}
