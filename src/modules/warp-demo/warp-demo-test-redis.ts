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
  async eval(script: string, _numberOfKeys: number, key: string, ...args: Array<string | number>) {
    const stored = await this.hgetall(key);
    if (script.includes('"mutationCount"')) {
      if (!stored.id) return [-1, "expired"];
      if (Number(stored.revision) !== Number(args[0])) return [-2, "stale"];
      if (stored.activeRunId && String(args[4]) !== "1") return [-3, "active"];
      const count = Number(stored.mutationCount) + (String(args[3]) === "1" ? 1 : 0);
      if (count > Number(args[5])) return [-4, "limit"];
      const revision = Number(stored.revision) + 1;
      await this.hset(key, { revision: String(revision), activeRunId: String(args[1]), employee: String(args[2]), mutationCount: String(count) });
      return [revision, "ok"];
    }
    if (script.includes('"assignments"')) {
      if (!stored.id) return 0;
      if (Number(stored.revision) !== Number(args[0]) || stored.activeRunId !== String(args[1])) return -1;
      await this.hset(key, { assignments: String(args[2]), audit: String(args[3]), activeRunId: "" });
      return 1;
    }
    if (script.includes('"activeRunId"')) {
      if (stored.activeRunId !== String(args[0])) return 0;
      await this.hset(key, { activeRunId: "" });
      return 1;
    }
    return 0;
  }
}
