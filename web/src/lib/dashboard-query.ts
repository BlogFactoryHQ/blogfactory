export interface JobListEnvelope<T> {
  jobs: T[];
}

export function recentJobsFromResponse<T>(response: T[] | JobListEnvelope<T>) {
  if (Array.isArray(response)) return response;
  return Array.isArray(response.jobs) ? response.jobs : [];
}
