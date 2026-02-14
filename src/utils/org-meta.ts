// org-meta.ts — Org subdomain to display name mapping

const orgs: Record<string, string> = {
  pip: "Portsmouth International Port",
  tfl: "Transport for London",
};

export function orgName(slug: string): string {
  return orgs[slug] ?? slug;
}
