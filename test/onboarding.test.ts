import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { shouldRunTour } from "@/components/onboarding-tour";
const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("localStorage", { getItem: () => "1", setItem: vi.fn(), removeItem: vi.fn() });
  fetchMock.mockReset();
});
afterEach(() => vi.unstubAllGlobals());
describe("onboarding per team member", () => {
  it("welcomes a new person even if someone else completed the tour on this computer", async () => {
    fetchMock.mockResolvedValue(Response.json({ completed: false }));
    expect(await shouldRunTour()).toBe(true);
  });
  it("does not replay a completed tour on a new browser", async () => {
    fetchMock.mockResolvedValue(Response.json({ completed: true }));
    expect(await shouldRunTour()).toBe(false);
  });
  it("leaves the app usable if the completion lookup fails", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    expect(await shouldRunTour()).toBe(false);
  });
});
