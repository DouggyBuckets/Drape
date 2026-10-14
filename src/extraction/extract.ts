import Anthropic, { AnthropicError } from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { anthropic, MODEL } from "../llm/client.js";
import { ExtractionError } from "./errors.js";
import { prepareImage } from "./image.js";
import { EXTRACTION_SYSTEM_PROMPT } from "./prompt.js";
import { type ItemAttributes, ItemAttributesSchema } from "./schema.js";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface ExtractionResult {
  attributes: ItemAttributes;
  /** The JPEG actually sent to the model (rotated, resized, metadata stripped). */
  image: Buffer;
  /** Model that produced the answer; differs from MODEL if a fallback ran. */
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

export type Extractor = (photo: Buffer) => Promise<ExtractionResult>;

export async function extractAttributes(
  photo: Buffer,
  { effort = "low" }: { effort?: Effort } = {},
): Promise<ExtractionResult> {
  const image = await prepareImage(photo);

  let response;
  try {
    response = await anthropic.beta.messages.parse({
      model: MODEL,
      max_tokens: 16_000,
      system: EXTRACTION_SYSTEM_PROMPT,
      // If a safety classifier declines, retry server-side on Anthropic's recommended model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort, format: betaZodOutputFormat(ItemAttributesSchema) },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image.toString("base64") } },
            { type: "text", text: "Catalog this clothing item." },
          ],
        },
      ],
    });
  } catch (err) {
    // API/network errors propagate as-is; a plain AnthropicError here means the
    // response arrived but failed our Zod validation (e.g. warmth: 7).
    if (err instanceof AnthropicError && !(err instanceof Anthropic.APIError)) {
      throw new ExtractionError("invalid_output", err.message, { cause: err });
    }
    throw err;
  }

  if (response.stop_reason === "refusal") {
    throw new ExtractionError("refused", "The model declined to describe this image.");
  }
  if (!response.parsed_output) {
    throw new ExtractionError("invalid_output", `No structured output (stop_reason: ${response.stop_reason}).`);
  }

  return {
    attributes: response.parsed_output,
    image,
    model: response.model,
    usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
  };
}
