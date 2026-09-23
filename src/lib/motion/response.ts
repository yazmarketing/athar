import "server-only";
import { OpenAIError, readOpenAIResponse } from "@/lib/openai-server";

export const MOTION_OUTPUT_BUDGET = 64000;
export const MOTION_RECOVERY_BUDGET = 128000;

export type MotionResponse = {
  id: string;
  status: "queued" | "in_progress" | "completed" | "failed" | "cancelled" | "incomplete";
  usage?: { output_tokens?: number; output_tokens_details?: { reasoning_tokens?: number } };
  incomplete_details?: { reason?: string };
  output?: { type?: string; content?: { type?: string; text?: string; refusal?: string }[] }[];
};

/** Background Responses avoids keeping a connection open during Astra reasoning.
 * https://developers.openai.com/api/docs/guides/background
 * Stored responses let the local workspace retrieve results after a restart. */
export async function motionResponse(input: unknown[] | string, maxOutputTokens = MOTION_OUTPUT_BUDGET): Promise<MotionResponse> {
  if (![MOTION_OUTPUT_BUDGET, MOTION_RECOVERY_BUDGET].includes(maxOutputTokens)) throw new Error("Invalid motion response budget");
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new OpenAIError("Connect OpenAI to use Astra.", { status: 503 });
  const retrieve = typeof input === "string";
  const base = (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const response = await fetch(`${base}/responses${retrieve ? `/${encodeURIComponent(input)}` : ""}`, {
    method: retrieve ? "GET" : "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    ...(retrieve ? {} : { body: JSON.stringify({ model: "gpt-6-astra", input, background: true, store: true, reasoning: { effort: "high" }, max_output_tokens: maxOutputTokens, text: { format: { type: "json_object" } } }) }),
    signal: AbortSignal.timeout(60000),
    cache: "no-store",
  });
  const result = await readOpenAIResponse<MotionResponse>(response);
  if (!result.id || !["queued", "in_progress", "completed", "failed", "cancelled", "incomplete"].includes(result.status)) throw new OpenAIError("Astra returned an invalid request status.", { code: "invalid_response" });
  return result;
}

export function motionResponseText(result: MotionResponse): string {
  if (result.status === "incomplete" && result.incomplete_details?.reason === "max_output_tokens") throw new Error("This design exceeded the expanded response limit. Your brief and previous animation are saved. Try directing one sequence at a time.");
  if (result.status !== "completed") throw new Error(`Astra could not finish this direction (${result.incomplete_details?.reason ?? result.status}). Your previous animation is unchanged. Try a more focused revision.`);
  const content = (result.output ?? []).filter(item => item.type === "message").flatMap(item => item.content ?? []);
  const refusal = content.find(part => part.type === "refusal")?.refusal;
  if (refusal) throw new Error(`Astra declined this direction: ${refusal.slice(0, 200)}`);
  const text = content.filter(part => part.type === "output_text").map(part => part.text ?? "").join("");
  if (!text.trim()) throw new Error("Astra returned no design. Your previous animation is unchanged.");
  return text;
}
