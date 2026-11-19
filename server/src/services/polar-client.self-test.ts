import assert from "node:assert/strict";
import { appUrl, polarServer } from "./polar-client.js";

assert.equal(appUrl({ WEB_APP_URL: "https://app.blogfactory.io/" } as NodeJS.ProcessEnv), "https://app.blogfactory.io");
assert.equal(polarServer({ POLAR_SERVER: "production" } as NodeJS.ProcessEnv), "production");
assert.equal(polarServer({ POLAR_SERVER: "anything-else" } as NodeJS.ProcessEnv), "sandbox");

console.log("Polar client configuration self-test passed");
