import { describe, expect, test } from "bun:test";
import * as crypto from "node:crypto";

import type { Api, Model } from "@oh-my-pi/pi-catalog/types";

import { buildTargetModel, foldSystemPromptIntoUserMessage, loadDroidSystemPrompt } from "./router";

describe("loadDroidSystemPrompt", () => {
  test("loads the local captured prompt for every Factory route", () => {
    const chat = loadDroidSystemPrompt("openai-completions");
    const messages = loadDroidSystemPrompt("anthropic-messages");
    const responses = loadDroidSystemPrompt("openai-responses");

    expect(chat?.length).toBeGreaterThan(3000);
    expect(messages?.length).toBeGreaterThan(3000);
    expect(responses?.length).toBeGreaterThan(3000);
    expect(crypto.createHash("sha256").update(chat!).digest("hex")).toBe(
      crypto.createHash("sha256").update(responses!).digest("hex"),
    );
  });
});

describe("foldSystemPromptIntoUserMessage", () => {
  test("moves the omp system prompt into the first user turn and clears the system field", () => {
    const folded = foldSystemPromptIntoUserMessage({
      systemPrompt: ["You are Oh My Pi."],
      messages: [{ role: "user", content: "ok", timestamp: 1 }],
    });

    expect(folded.systemPrompt).toBeUndefined();
    expect(folded.messages[0]).toMatchObject({
      role: "user",
      content: "<system>\nYou are Oh My Pi.\n</system>\n\nok",
    });
  });
});

describe("buildTargetModel", () => {
  test("grok-4.6 keeps Extra high thinking and xai identity", () => {
    // Fixture supplies the fields buildTargetModel copies; omp session models carry more.
    const session = {
      id: "grok-4.6",
      name: "Grok 4.6 (Factory)",
      api: "factory" as Api,
      provider: "factory",
      baseUrl: "https://api.factory.ai",
      reasoning: true,
      input: ["text", "image"] as Model<Api>["input"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 200000,
      maxTokens: 63356,
    } as Model<Api>;
    const target = buildTargetModel(session, "openai-responses", null, "https://api.factory.ai");
    const { compat } = target;

    expect(target.thinking?.efforts?.join(",")).toBe("low,medium,high,xhigh");
    expect(target.identity).toEqual({ class: "xai", family: "grok", revision: "4.6.0" });
    if (!("reasoningEffortMap" in compat)) {
      throw new Error("grok target must carry an OpenAI-family reasoningEffortMap");
    }
    expect(compat.reasoningEffortMap).toEqual({ minimal: "low" });
  });
});

