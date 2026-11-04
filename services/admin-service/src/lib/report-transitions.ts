export type ReportStatus = "OPEN" | "IN_REVIEW" | "RESOLVED" | "REJECTED";
export type TargetStatus = Exclude<ReportStatus, "OPEN">;

export const allowedTransitions: Record<ReportStatus, TargetStatus[]> = {
  OPEN: ["IN_REVIEW", "REJECTED"],
  IN_REVIEW: ["RESOLVED", "REJECTED"],
  RESOLVED: [],
  REJECTED: [],
};

export const canTransition = (from: ReportStatus, to: TargetStatus): boolean => allowedTransitions[from].includes(to);

/** Final outcomes need a note, record who closed the report and notify the reporter. */
export const isFinalStatus = (status: ReportStatus): status is "RESOLVED" | "REJECTED" => status === "RESOLVED" || status === "REJECTED";
