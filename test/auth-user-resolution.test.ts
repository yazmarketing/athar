import { beforeEach, describe, expect, it, vi } from "vitest";
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: () => ({ query }) }));
import { resolveDbUserId } from "@/lib/auth-users";
beforeEach(() => {
  vi.resetAllMocks();
  query.mockImplementation(async (sql: string) => ({ rows: sql.includes("insert into public.users") ? [{ id: "user", email: "test@example.com", role: "creator" }] : sql.includes("select active") ? [{ active: true }] : [] }));
});
describe("concurrent thumbnail authentication", () => {
  it("shares one user upsert across concurrent requests", async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => resolveDbUserId({ email: "concurrent@example.com" })));
    expect(results).toEqual(Array(10).fill("user"));
    expect(query.mock.calls.filter(([sql]) => sql.includes("insert into public.users"))).toHaveLength(1);
  });
  it("clears a failed lookup so a later request can recover", async () => {
    query.mockRejectedValueOnce(new Error("database unavailable"));
    expect(await resolveDbUserId({ email: "recover@example.com" })).toBeNull();
    expect(await resolveDbUserId({ email: "recover@example.com" })).toBe("user");
  });
});
