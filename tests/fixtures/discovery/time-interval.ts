// Two construction shapes against a named interface:
// (a) a factory function returning a typed literal,
// (b) a typed-const declaration whose value is a literal.

export interface TimeInterval {
  start: number;
  end: number | null;
}

export function makeInterval(start: number): TimeInterval {
  return { start, end: null };
}

export function closeInterval(open: TimeInterval, end: number): TimeInterval {
  const closed: TimeInterval = { start: open.start, end };
  return closed;
}
