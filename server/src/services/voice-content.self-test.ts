import assert from "node:assert/strict";
import { buildVoiceContentInstructions } from "./voice-content.js";

assert.deepEqual(buildVoiceContentInstructions(), []);

const custom = buildVoiceContentInstructions({
  articleVoice: "Professional",
  voiceMode: "custom",
  customVoiceProfile: {
    finalPromptInstructions: "Write like the sample: direct, warm, and concrete.",
  },
});

assert.equal(custom.some((line) => line.includes("Professional")), false);
assert.equal(custom.some((line) => line.includes("direct, warm, and concrete")), true);

const rules = buildVoiceContentInstructions({
  contentRules: {
    bannedWords: ["utilize"],
    bannedPhrases: ["at the end of the day"],
    preferredTerms: [{ from: "users", to: "customers" }],
    competitorAvoidance: true,
    competitors: ["CompetitorCo"],
    avoidAiPhrases: true,
  },
});

assert.equal(rules.some((line) => line.includes("utilize")), true);
assert.equal(rules.some((line) => line.includes("at the end of the day")), true);
assert.equal(rules.some((line) => line.includes("users -> customers")), true);
assert.equal(rules.some((line) => line.includes("CompetitorCo")), true);
assert.equal(rules.some((line) => line.includes("fast-paced world")), true);

console.log("voice-content self-check passed");
