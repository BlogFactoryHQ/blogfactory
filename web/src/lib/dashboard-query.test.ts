import { describe, expect, it } from "vitest";
import { recentJobsFromResponse } from "./dashboard-query";

describe("recentJobsFromResponse", () => {
  it("reads the paginated jobs response used by the dashboard", () => {
    const jobs = [{ id: "job-1", status: "completed" }];
    expect(recentJobsFromResponse({ jobs })).toEqual(jobs);
  });

  it("keeps legacy array responses safe during rollout", () => {
    const jobs = [{ id: "job-1", status: "running" }];
    expect(recentJobsFromResponse(jobs)).toEqual(jobs);
  });
});
