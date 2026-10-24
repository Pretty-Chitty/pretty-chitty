import { describe, expect, it } from "vitest";
import { buildTokenMap, parseMessageTokens, tokenizedMessageToText } from "./TokenizedText";

describe("tokenizedMessageToText", () => {
  const tokenMap = buildTokenMap(
    { gold: { image: "gold.png", text: "gold" }, vp: { label: "VP", color: "#fff" }, iconOnly: { image: "x.png" } },
    [{ playerId: "player0", name: "Josh", color: "#f00", imageUrl: "josh.png" }],
  );

  it("replaces player tokens with the player's name", () => {
    expect(tokenizedMessageToText("Follow :player0:'s action", tokenMap)).toBe("Follow Josh's action");
  });

  it("prefers text, then label, and keeps unknown or image-only tokens as-is", () => {
    expect(tokenizedMessageToText("Pay 2 :gold: for 1 :vp:", tokenMap)).toBe("Pay 2 gold for 1 VP");
    expect(tokenizedMessageToText(":iconOnly: and :nope:", tokenMap)).toBe(":iconOnly: and :nope:");
  });

  it("gives the warning token a text form", () => {
    expect(tokenizedMessageToText(":warning: Last round", tokenMap)).toBe("Warning: Last round");
  });

  it("leaves plain messages untouched", () => {
    expect(tokenizedMessageToText("Waiting for turn to complete", tokenMap)).toBe("Waiting for turn to complete");
    expect(tokenizedMessageToText("", tokenMap)).toBe("");
  });

  it("parses text runs and tokens in order", () => {
    const parts = parseMessageTokens("a :player0: b", tokenMap);
    expect(parts.map((p) => p.type)).toEqual(["text", "token", "text"]);
  });
});
