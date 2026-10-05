/** The person's choice overrides the operating-system preference. */
export function motionReduced(systemReduced: boolean): boolean {
  const setting = document.documentElement.dataset.motion;
  return setting === "reduced" || (setting !== "full" && systemReduced);
}
