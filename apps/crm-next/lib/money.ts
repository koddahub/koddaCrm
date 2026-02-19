export function toCentsFromNumber(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

export function toCentsFromInput(input: unknown): number {
  if (input === null || input === undefined) return 0;
  if (typeof input === 'number') return toCentsFromNumber(input);
  const normalized = String(input)
    .trim()
    .replace(/\./g, '')
    .replace(',', '.');
  const num = Number(normalized);
  return toCentsFromNumber(num);
}

export function decimalToCents(value: { toNumber: () => number } | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return toCentsFromNumber(value);
  return toCentsFromNumber(value.toNumber());
}
