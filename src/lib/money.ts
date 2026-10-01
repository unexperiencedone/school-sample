/**
 * Money helpers. All amounts are integer paise (1 rupee = 100 paise). INR only.
 * Never pass floats around: convert at the edges (forms, CSV import) with `toPaise`.
 */

export type Paise = number;

export function assertPaise(value: number, label = "amount"): Paise {
  if (!Number.isSafeInteger(value))
    throw new RangeError(`${label} must be an integer number of paise, got ${value}`);
  return value;
}

/** Rupees (number or string such as "1,25,000.50") → paise. Rounds half away from zero to the nearest paisa. */
export function toPaise(rupees: number | string): Paise {
  const raw = typeof rupees === "string" ? rupees.replace(/[₹,\s]/g, "") : String(rupees);
  if (!/^-?\d+(\.\d+)?$/.test(raw)) throw new RangeError(`Not a money value: ${rupees}`);
  const negative = raw.startsWith("-");
  const [whole, frac = ""] = raw.replace("-", "").split(".");
  const fracPadded = (frac + "000").slice(0, 3);
  let paise = Number(whole) * 100 + Number(fracPadded.slice(0, 2));
  if (Number(fracPadded[2]) >= 5) paise += 1;
  return negative ? -paise : paise;
}

export function rupees(amount: number): Paise {
  return toPaise(amount);
}

/** Paise → "₹1,25,000" (Indian digit grouping). Shows paise only when non-zero unless `alwaysDecimals`. */
export function formatINR(paise: Paise, opts: { alwaysDecimals?: boolean; sign?: boolean } = {}): string {
  assertPaise(paise);
  const negative = paise < 0;
  const abs = Math.abs(paise);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const grouped = groupIndian(String(whole));
  const decimals = frac !== 0 || opts.alwaysDecimals ? `.${String(frac).padStart(2, "0")}` : "";
  const sign = negative ? "−" : opts.sign && paise > 0 ? "+" : "";
  return `${sign}₹${grouped}${decimals}`;
}

/** Plain number string for CSV/inputs: 125000.5 → "125000.50" */
export function paiseToRupeeString(paise: Paise): string {
  const negative = paise < 0;
  const abs = Math.abs(paise);
  return `${negative ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${rest},${last3}`;
}

/** Percentage of an amount where percent is in basis points (10_000 = 100%). Rounds half up. */
export function percentOf(paise: Paise, basisPoints: number): Paise {
  assertPaise(paise);
  assertPaise(basisPoints, "basisPoints");
  const product = paise * basisPoints;
  const sign = product < 0 ? -1 : 1;
  return sign * Math.floor((Math.abs(product) + 5_000) / 10_000);
}

/**
 * Split `total` into parts proportional to `weights` so that the parts always sum exactly to `total`.
 * Uses the largest-remainder method; ties go to the earliest part.
 */
export function splitByWeights(total: Paise, weights: number[]): Paise[] {
  assertPaise(total);
  if (weights.length === 0) throw new RangeError("weights must not be empty");
  const sumW = weights.reduce((a, b) => a + b, 0);
  if (sumW <= 0) throw new RangeError("weights must sum to a positive number");
  const exact = weights.map((w) => (total * w) / sumW);
  const floors = exact.map((x) => Math.floor(x));
  let remainder = total - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (remainder <= 0) break;
    floors[i] += 1;
    remainder -= 1;
  }
  return floors;
}

export function sum(values: Paise[]): Paise {
  return values.reduce((a, b) => a + b, 0);
}
