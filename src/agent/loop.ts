import type Anthropic from "@anthropic-ai/sdk";
import type { Effort } from "../extraction/extract.js";
import { MODEL } from "../llm/client.js";
import { AGENT_SYSTEM_PROMPT } from "./prompt.js";
import { type AcceptedOutfit, runTool, TOOL_DEFINITIONS, type ToolDeps } from "./tools.js";

export type CreateMessage = (
  params: Anthropic.Beta.MessageCreateParamsNonStreaming,
) => Promise<Anthropic.Beta.BetaMessage>;

export interface AgentDeps extends ToolDeps {
  /** Injected so tests can script the model; production passes anthropic.beta.messages.create. */
  createMessage: CreateMessage;
  maxIterations?: number;
  effort?: Effort;
  now?: () => Date;
}

export interface AgentRequest {
  request: string;
  location?: string;
}

export type TraceEvent =
  | { iteration: number; type: "text"; text: string }
  | { iteration: number; type: "tool_call"; name: string; input: unknown; output: unknown; isError: boolean }
  | { iteration: number; type: "nudge"; text: string };

export interface AgentResult {
  status: "ok" | "max_iterations" | "refused" | "truncated";
  outfit: AcceptedOutfit | null;
  /** Number of model calls made. */
  iterations: number;
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number };
  /** Model(s) that served the run; more than one only if a refusal fallback ran. */
  models: string[];
  trace: TraceEvent[];
}

export const DEFAULT_MAX_ITERATIONS = 8;

const NUDGE = "Please finish by calling submit_outfit with your chosen item ids.";

export async function runOutfitAgent(req: AgentRequest, deps: AgentDeps): Promise<AgentResult> {
  const maxIterations = deps.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const today = (deps.now?.() ?? new Date()).toISOString().slice(0, 10);

  // Append-only: every response is pushed back exactly as returned (thinking blocks
  // included). Editing earlier turns would invalidate the model's thinking and the cache.
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    {
      role: "user",
      content: `Request: ${req.request}\nLocation: ${req.location ?? "not given"}\nToday's date: ${today}`,
    },
  ];

  const trace: TraceEvent[] = [];
  const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  const models = new Set<string>();
  const result = (status: AgentResult["status"], iterations: number, outfit: AcceptedOutfit | null = null): AgentResult =>
    ({ status, outfit, iterations, usage, models: [...models], trace });

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    const response = await deps.createMessage({
      model: MODEL,
      max_tokens: 16_000,
      system: AGENT_SYSTEM_PROMPT,
      tools: TOOL_DEFINITIONS,
      messages,
      output_config: { effort: deps.effort ?? "medium" },
      // Caches the growing prefix (tools, system, earlier turns) across iterations.
      cache_control: { type: "ephemeral" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });

    models.add(response.model);
    usage.inputTokens += response.usage.input_tokens;
    usage.outputTokens += response.usage.output_tokens;
    usage.cacheReadTokens += response.usage.cache_read_input_tokens ?? 0;
    usage.cacheWriteTokens += response.usage.cache_creation_input_tokens ?? 0;

    if (response.stop_reason === "refusal") return result("refused", iteration);

    messages.push({ role: "assistant", content: response.content });
    for (const block of response.content) {
      if (block.type === "text" && block.text.trim()) trace.push({ iteration, type: "text", text: block.text });
    }

    if (response.stop_reason === "max_tokens") return result("truncated", iteration);

    const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (toolUses.length === 0) {
      // Ended its turn without submitting; ask once per turn (still counts toward the cap).
      trace.push({ iteration, type: "nudge", text: NUDGE });
      messages.push({ role: "user", content: NUDGE });
      continue;
    }

    // Parallel tool calls run concurrently, and all results go back in ONE user message.
    const outcomes = await Promise.all(toolUses.map((t) => runTool(t.name, t.input, deps)));
    let accepted: AcceptedOutfit | undefined;
    const toolResults: Anthropic.Beta.BetaToolResultBlockParam[] = toolUses.map((t, i) => {
      const o = outcomes[i]!;
      trace.push({ iteration, type: "tool_call", name: t.name, input: t.input, output: o.content, isError: o.isError });
      accepted ??= o.accepted;
      return { type: "tool_result", tool_use_id: t.id, content: JSON.stringify(o.content), is_error: o.isError };
    });

    if (accepted) return result("ok", iteration, accepted);
    messages.push({ role: "user", content: toolResults });
  }

  return result("max_iterations", maxIterations);
}
