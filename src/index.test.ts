import { describe, expect, it } from "vitest";
import entry from "./index.js";
import { getToolPluginMetadata } from "openclaw/plugin-sdk/tool-plugin";

describe("datacircle", () => {
  it("declares tool metadata", () => {
    expect(getToolPluginMetadata(entry)?.tools.map((tool) => tool.name)).toEqual([
      "datacircle_list_apis",
      "datacircle_best_plans",
      "datacircle_search_plans",
      "datacircle_provider",
    ]);
  });
});
