import { isCronAuthorized } from "./cron.js";

process.env.CRON_SECRET = "secret";

console.assert(isCronAuthorized("Bearer secret"), "accepts matching bearer token");
console.assert(!isCronAuthorized("Bearer nope"), "rejects wrong bearer token");
console.assert(!isCronAuthorized(undefined), "rejects missing header");
console.assert(!isCronAuthorized("Bearer secret", ""), "rejects missing configured secret");

console.log("cron self-test ok");
