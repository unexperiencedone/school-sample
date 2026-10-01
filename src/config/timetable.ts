/** The school day: six teaching periods (IST). Used by timetables and the teacher dashboard. */
export const PERIOD_TIMES: Record<number, { start: string; end: string }> = {
  1: { start: "8:40", end: "9:25" },
  2: { start: "9:30", end: "10:15" },
  3: { start: "10:40", end: "11:25" },
  4: { start: "11:30", end: "12:15" },
  5: { start: "13:20", end: "14:05" },
  6: { start: "14:10", end: "14:55" },
};

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] as const;
