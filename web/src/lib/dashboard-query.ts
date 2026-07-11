export interface JobListEnvelope<T> {
  items: T[];
}

export function recentJobsFromResponse<T>(response: T[] | JobListEnvelope<T> | null | undefined) {
  if (Array.isArray(response)) return response;
  return response && Array.isArray(response.items) ? response.items : [];
}
