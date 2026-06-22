import assert from "node:assert/strict";
import { buildSportsNewsInstructions, classifySportsNews, type SportsMatrixRow } from "./sports-news.js";

const rows: SportsMatrixRow[] = [
  { sourceName: "Fabrizio Romano", reliability: 5, sourceType: "Insider", publishRule: "TIER 1: Kaynağa ATIFLA hızlı yaz.", tags: "#Transfer, #Futbol", embedSource: "FotMob embed", xLink: "https://x.com/FabrizioRomano", status: "AKTİF" },
  { sourceName: "Premier League Official", reliability: 3, sourceType: "Resmî", publishRule: "RESMÎ: '[RESMÎ]' etiketi.", tags: "#ResmiAçıklama, #Futbol", siteLink: "https://www.premierleague.com/", status: "AKTİF" },
  { sourceName: "Reuters Soccer", reliability: 5, sourceType: "Ajans/Kurum", publishRule: "AJANS/KURUM: '[DOĞRULANMIŞ HABER]' yaz.", tags: "#Futbol", siteLink: "https://www.reuters.com/sports/soccer/", status: "AKTİF" },
  { sourceName: "Transfermarkt", reliability: 3, sourceType: "Veri/Scout", publishRule: "VERİ: Haber üretme.", siteLink: "https://www.transfermarkt.com/", status: "AKTİF" },
  { sourceName: "Retired Reporter", reliability: 4, sourceType: "Insider", publishRule: "TIER 2", status: "PASİF" },
];

const romano = classifySportsNews({ title: "Romano update", content: "Fabrizio Romano'ya göre görüşmeler sürüyor.", matrixRows: rows });
assert.equal(romano.allowed, true);
assert.equal(romano.label, "[MANŞET - ATIFLI]");
assert.match(romano.attribution || "", /Fabrizio Romano/);

const official = classifySportsNews({ url: "https://www.premierleague.com/news/1", matrixRows: rows });
assert.equal(official.label, "[RESMÎ]");

const agency = classifySportsNews({ url: "https://www.reuters.com/sports/soccer/story", matrixRows: rows });
assert.equal(agency.label, "[DOĞRULANMIŞ HABER]");

const dataOnly = classifySportsNews({ url: "https://www.transfermarkt.com/player", matrixRows: rows });
assert.equal(dataOnly.allowed, false);
assert.match(dataOnly.reason || "", /data\/scout/i);

const passive = classifySportsNews({ content: "Retired Reporter says something.", matrixRows: rows });
assert.equal(passive.allowed, false);
assert.match(passive.reason || "", /passive/i);

const unknown = classifySportsNews({ content: "Unknown blog says something.", matrixRows: rows });
assert.equal(unknown.allowed, false);
assert.match(unknown.reason || "", /not in the news matrix/i);

const prompt = buildSportsNewsInstructions(romano);
assert.match(prompt, /Fabrizio Romano/);
assert.match(prompt, /#Transfer/);
assert.match(prompt, /FotMob embed/);
assert.match(prompt, /Şok!/);

console.log("sports-news self-test ok");
