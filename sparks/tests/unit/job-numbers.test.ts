import { describe, expect, it } from "vitest";
import { formatJobNumber, jobNumberOf, jobSequenceCode } from "@/lib/job-numbers";

describe("job numbers", () => {
  it("match Trimble's File # format: year then a three-digit count", () => {
    expect(formatJobNumber(2026, 1)).toBe("2026001");
    expect(formatJobNumber(2026, 211)).toBe("2026211");
    expect(formatJobNumber(2027, 1000)).toBe("20271000");
    expect(jobSequenceCode(2027)).toBe("JOB-2027");
  });

  it("reject impossible counts", () => {
    expect(() => formatJobNumber(2026, 0)).toThrow();
    expect(() => formatJobNumber(2026, 1.5)).toThrow();
  });

  it("a work order under a project shows the project's job number", () => {
    expect(jobNumberOf({ jobNumber: null, project: { jobNumber: "2026014" } })).toBe("2026014");
    expect(jobNumberOf({ jobNumber: "2026003", project: null })).toBe("2026003");
    expect(jobNumberOf({ jobNumber: "2026003", project: { jobNumber: "2026014" } })).toBe("2026014");
    expect(jobNumberOf({ jobNumber: null })).toBeNull();
  });
});
