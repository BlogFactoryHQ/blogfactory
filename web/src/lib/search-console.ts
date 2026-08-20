export function searchConsoleCountryLabel(code: string, locale = "en") {
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(code.toUpperCase()) || code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

export function toggleInspectionSelection(current: string[], url: string, checked: boolean, max = 10) {
  if (!checked) return { urls: current.filter((item) => item !== url), limited: false };
  if (current.includes(url)) return { urls: current, limited: false };
  if (current.length >= max) return { urls: current, limited: true };
  return { urls: [...current, url], limited: false };
}
