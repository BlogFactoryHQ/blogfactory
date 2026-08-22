export function requiredHttpsUrl(name: string, value?: string) {
  let url: URL;
  try {
    url = new URL(value || "");
  } catch {
    throw new Error(`${name} must be a valid HTTPS URL`);
  }
  if (url.protocol !== "https:") throw new Error(`${name} must be a valid HTTPS URL`);
  return url.toString();
}
