export function credentialUsable(value?: { credentialStatus?: string; credential_status?: string } | null) {
  const status = value?.credentialStatus ?? value?.credential_status;
  return status === undefined || status === "usable";
}

export function connectionReady(value?: { ready?: boolean; status?: string; credentialStatus?: string; credential_status?: string } | null) {
  if (typeof value?.ready === "boolean") return value.ready;
  return value?.status === "connected" && credentialUsable(value);
}

export function displayConnectionStatus(value: { status?: string; credentialStatus?: string; credential_status?: string }) {
  const credentialStatus = value.credentialStatus ?? value.credential_status;
  if (credentialStatus === "undecryptable") return "Needs re-save";
  if (credentialStatus === "missing") return "Missing credential";
  return value.status || "missing";
}
