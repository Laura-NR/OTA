/** The web preview (screenshots and e2e only) is served fresh; it has no JS updates. */
export async function fetchJsUpdate(): Promise<boolean> {
  return false;
}
