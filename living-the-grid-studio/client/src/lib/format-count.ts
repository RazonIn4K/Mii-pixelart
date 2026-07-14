export function formatCountLabel(
  value: number,
  singular: string,
  plural = `${singular}s`,
): string {
  const label = value === 1 ? singular : plural;
  return `${value.toLocaleString("en-US")} ${label}`;
}
