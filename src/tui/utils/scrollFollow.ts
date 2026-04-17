export function computeScrollOffset(
  row: number,
  prevOffset: number,
  visibleRows: number,
  total: number,
): number {
  let next = prevOffset;
  if (row < next) next = row;
  else if (row >= next + visibleRows) next = row - visibleRows + 1;
  const max = Math.max(0, total - visibleRows);
  return Math.max(0, Math.min(next, max));
}
