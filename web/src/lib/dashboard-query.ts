export interface JobListEnvelope<T> {
  items: T[];
}

export function recentJobsFromResponse<T>(response: T[] | JobListEnvelope<T>) {
  if (Array.isArray(response)) return response;
  return Array.isArray(response.items) ? response.items : [];
}
