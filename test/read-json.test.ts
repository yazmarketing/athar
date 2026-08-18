import { describe, expect, it } from "vitest";
import { readJson } from "@/lib/utils";

function htmlResponse(status: number) {
  return new Response(
    "<!DOCTYPE html><html><head><title>504 Gateway Time-out</title></head>" +
      "<body><h1>504 Gateway Time-out</h1></body></html>",
    { status, headers: { "content-type": "text/html" } }
  );
}

describe("readJson", () => {
  it("parses a normal JSON body", async () => {
    const res = new Response(JSON.stringify({ generation: { id: "abc" } }), {
      headers: { "content-type": "application/json" },
    });
    await expect(readJson(res)).resolves.toEqual({
      generation: { id: "abc" },
    });
  });

  it("explains a gateway timeout instead of a parser error", async () => {
    await expect(readJson(htmlResponse(504))).rejects.toThrow(
      /longer than the gateway allows \(504\)/
    );
  });

  it("tells you a 502 render may still have landed", async () => {
    await expect(readJson(htmlResponse(502))).rejects.toThrow(/502/);
    await expect(readJson(htmlResponse(502))).rejects.toThrow(/Library/);
  });

  it("reports the status and strips markup for anything else", async () => {
    const err = await readJson(htmlResponse(500)).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    const message = (err as Error).message;
    expect(message).toContain("500");
    // The snippet is readable text, never raw tags.
    expect(message).not.toContain("<");
  });

  it("never surfaces the raw 'Unexpected token' parser error", async () => {
    const err = await readJson(htmlResponse(504)).catch((e: Error) => e);
    expect((err as Error).message).not.toMatch(/Unexpected token/);
  });
});
