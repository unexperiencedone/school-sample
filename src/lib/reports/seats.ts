export type SeatPosition = {
  /** Capacity minus pupils minus open offers; negative when the class is over-subscribed. */
  left: number;
  over: number;
  status: string;
};

/** Open offers count against capacity, because accepting them fills the seats. */
export function seatPosition(capacity: number, enrolled: number, offered: number): SeatPosition {
  const left = capacity - enrolled - offered;
  return {
    left,
    over: Math.max(0, -left),
    status: left < 0 ? `Over by ${-left}` : left === 0 ? "Full" : "Open",
  };
}
