// org-meta.js — Org subdomain to display name mapping

const orgs: Record<string, string> = {
  pip: "Portsmouth International Port",
};

export function orgName(slug: string): string {
  return orgs[slug] ?? slug;
}
