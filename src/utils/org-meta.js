// org-meta.js — Org subdomain to display name mapping

const orgs = {
  pip: "Portsmouth International Port",
};

export function orgName(slug) {
  return orgs[slug] ?? slug;
}
