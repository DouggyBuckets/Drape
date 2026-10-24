import { describe, expect, it } from "vitest";
import type { TraceEvent } from "./api";
import { describeStep } from "./trace";

const call = (name: string, input: Record<string, unknown>, output: unknown, isError = false): TraceEvent =>
  ({ iteration: 1, type: "tool_call", name, input, output, isError });

describe("describeStep", () => {
  it("describes searches with their filters and result count", () => {
    expect(describeStep(call("search_wardrobe", { category: "shoes", formality_min: 3, formality_max: 5, season: "winter" }, { count: 4 })))
      .toBe("Searched shoes (formality 3–5, winter): 4 found");
    expect(describeStep(call("search_wardrobe", { warmth_max: 2 }, { count: 9 }))).toBe("Searched all items (warmth ≤ 2): 9 found");
  });

  it("describes weather lookups and their failures", () => {
    expect(describeStep(call("get_weather", { location: "Chicago" }, { location: "Chicago, Illinois, US", date: "2026-10-21", highF: 66, lowF: 43 })))
      .toBe("Checked the weather in Chicago, Illinois, US (2026-10-21): high 66°F, low 43°F");
    expect(describeStep(call("get_weather", { location: "Atlantis" }, { error: "Unknown location: Atlantis" }, true)))
      .toBe("Weather lookup failed: Unknown location: Atlantis");
  });

  it("describes rule checks that pass and fail", () => {
    const input = { item_ids: [], temperature_f: 45, target_formality: 3 };
    expect(describeStep(call("check_outfit_rules", input, { failures: [], unknown_ids: [] })))
      .toBe("Checked the outfit for 45°F, formality 3: all rules passed");
    expect(describeStep(call("check_outfit_rules", input, { failures: [{ rule: "outerwear_when_cold", detail: "45°F calls for outerwear" }], unknown_ids: [] })))
      .toBe("Checked the outfit for 45°F, formality 3: 45°F calls for outerwear");
  });

  it("explains rejected submissions, including made-up ids", () => {
    expect(describeStep(call("submit_outfit", {}, { accepted: false, unknown_ids: ["x"], failures: [] }, true)))
      .toBe("Submission rejected: it included items not in the wardrobe");
    expect(describeStep(call("submit_outfit", {}, { accepted: true }))).toBe("Submitted the outfit");
  });

  it("quotes the model's notes", () => {
    expect(describeStep({ iteration: 2, type: "text", text: " Going with the boots. " })).toBe("Noted: “Going with the boots.”");
  });
});
