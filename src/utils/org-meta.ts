// org-meta.ts — Org subdomain to display name mapping

const orgs: Record<string, string> = {
  fif: "Portsmouth International Port", // Should be "pip" to match subdomain, but needs to match dataset. TODO: update data source to match subdomain and update this mapping.
  tfl: "Transport for London",
};

export function orgName(slug: string): string {
  return orgs[slug] ?? slug;
}
