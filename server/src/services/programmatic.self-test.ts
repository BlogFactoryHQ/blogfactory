import { strict as assert } from "node:assert";
import {
  BUILT_IN_PROGRAMMATIC_TEMPLATES,
  buildCombinations,
  materializeProgrammaticItems,
  parseCsv,
  programmaticSeoContext,
  renderTemplateText,
  scoreProgrammaticTemplate,
  templateVariables,
} from "./programmatic.js";

const local = BUILT_IN_PROGRAMMATIC_TEMPLATES.find((template) => template.id === "builtin-local-seo");

assert.ok(local);
assert.deepEqual(templateVariables(local), ["service", "city", "state", "year"]);
assert.equal(renderTemplateText("Best {{service}} in {{city}}", { service: "Plumbers", city: "Austin" }), "Best Plumbers in Austin");
assert.equal(parseCsv("city,state\nAustin,Texas").rows[0].state, "Texas");
assert.equal(buildCombinations({ city: ["Austin", "Denver"], service: ["Plumbers"] }).length, 2);
assert.equal(
  materializeProgrammaticItems({
    template: local,
    rows: [{ service: "Plumbers", city: "Austin", state: "Texas", year: "2026" }],
  }).items[0].title,
  "Best Plumbers in Austin, Texas | 2026 Guide",
);
assert.ok(scoreProgrammaticTemplate(local).score > 50);

const seoContext = programmaticSeoContext({
  primary_keyword: "yerel tesisatçı",
  secondary_keywords: "acil tesisat, su kaçağı",
  search_intent: "transactional",
  language: "tr",
  city: "İzmir",
  meta_title: "Eski ve kullanılmaması gereken başlık",
});
assert.deepEqual(seoContext.keywords, ["yerel tesisatçı", "acil tesisat", "su kaçağı"]);
assert.equal(seoContext.searchIntent, "transactional");
assert.equal(seoContext.requestedLanguage, "tr");
assert.match(seoContext.sourceContext, /city: İzmir/);
assert.doesNotMatch(seoContext.sourceContext, /meta_title/);
assert.throws(() => materializeProgrammaticItems({
  template: local,
  rows: [
    { service: "Plumbers", city: "Austin", state: "Texas", year: "2026" },
    { service: "Plumbers", city: "Austin", state: "Texas", year: "2026" },
  ],
}), /same article title/);

console.log("programmatic self-test ok");
