export function getSpeedOptions(totalEvents: number): number[] {
  return totalEvents >= 1000
    ? [1, 10, 25, 50, 100]
    : [1, 5, 10, 25]
}
