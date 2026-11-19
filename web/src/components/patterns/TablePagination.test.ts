import { describe, expect, it } from "vitest";
import { paginationWindow } from "./TablePagination";

describe("paginationWindow", () => {
  it("renders nothing for an empty result and a single page for one", () => {
    expect(paginationWindow(1, 0)).toEqual([]);
    expect(paginationWindow(1, 1)).toEqual([1]);
  });

  it("lists every page while they fit without elision", () => {
    expect(paginationWindow(2, 4)).toEqual([1, 2, 3, 4]);
  });

  it("elides the middle when the current page is near the start", () => {
    expect(paginationWindow(1, 12)).toEqual([1, 2, null, 12]);
  });

  it("keeps first and last visible around a middle page", () => {
    expect(paginationWindow(6, 12)).toEqual([1, null, 5, 6, 7, null, 12]);
  });

  it("elides only the leading gap near the end", () => {
    expect(paginationWindow(12, 12)).toEqual([1, null, 11, 12]);
  });

  it("never emits a gap marker for a single skipped page", () => {
    expect(paginationWindow(3, 5)).toEqual([1, 2, 3, 4, 5]);
  });
});
