import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), client: vi.fn(), project: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/auth-session", () => ({ getSessionUser: mocks.session }));
vi.mock("@/lib/clients", () => ({ deleteClientIfEmpty: mocks.client, renameClient: vi.fn() }));
vi.mock("@/lib/projects", () => ({ deleteProjectIfEmpty: mocks.project, getProject: vi.fn(), updateProject: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.audit }));

import { DELETE as deleteClient } from "@/app/api/clients/[id]/route";
import { DELETE as deleteProject } from "@/app/api/projects/[id]/route";

const id = "12345678-1234-4123-8123-123456789abc";
const request = new Request("http://localhost/api", { method: "DELETE" }) as Parameters<typeof deleteClient>[0];
const context = { params: Promise.resolve({ id }) };

beforeEach(() => vi.resetAllMocks());

describe.each([
  ["client", deleteClient, mocks.client],
  ["project", deleteProject, mocks.project],
] as const)("%s deletion", (entity, handler, remove) => {
  it.each(["creator", "viewer", undefined])("blocks non-management role %s before deleting", async (role) => {
    mocks.session.mockResolvedValue({ id: "user", role });
    expect((await handler(request, context)).status).toBe(403);
    expect(remove).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("requires a signed-in user", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await handler(request, context)).status).toBe(401);
    expect(remove).not.toHaveBeenCalled();
  });

  it("allows management and records who deleted it", async () => {
    mocks.session.mockResolvedValue({ id: "manager", email: "manager@example.com", role: "admin" });
    expect((await handler(request, context)).status).toBe(200);
    expect(remove).toHaveBeenCalledWith(id);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ userId: "manager", action: `${entity}_delete`, subjectId: id }));
  });

  it("still protects nonempty records from management deletion", async () => {
    mocks.session.mockResolvedValue({ id: "manager", role: "admin" });
    remove.mockRejectedValue(new Error("This record still has generations"));
    expect((await handler(request, context)).status).toBe(409);
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
