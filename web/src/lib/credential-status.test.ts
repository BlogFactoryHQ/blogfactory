import { describe, expect, it } from "vitest";
import { connectionReady, displayConnectionStatus } from "./credential-status";

describe("credential connection status", () => {
  it("preserves legacy integrations but rejects missing or undecryptable credentials", () => {
    expect(connectionReady({ status: "connected" })).toBe(true);
    expect(connectionReady({ status: "connected", credentialStatus: "usable" })).toBe(true);
    expect(connectionReady({ status: "connected", credential_status: "missing" })).toBe(false);
    expect(connectionReady({ status: "connected", credentialStatus: "undecryptable" })).toBe(false);
    expect(connectionReady({ ready: true, status: "pending", credentialStatus: "missing" })).toBe(true);
    expect(connectionReady({ ready: false, status: "connected", credentialStatus: "usable" })).toBe(false);
    expect(displayConnectionStatus({ status: "connected", credentialStatus: "missing" })).toBe("Missing credential");
    expect(displayConnectionStatus({ status: "connected", credential_status: "undecryptable" })).toBe("Needs re-save");
  });
});
