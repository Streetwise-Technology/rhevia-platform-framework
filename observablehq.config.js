import "dotenv/config";

const ORG_NAMES = {
  fif: "Portsmouth International Port", // Should be "pip" to match subdomain, but needs to match dataset. TODO: update data source to match subdomain and update this mapping.
  tfl: "Transport for London",
};

const org = process.env.ORG_SUBDOMAIN || "fif"; // Ditto above about matching subdomain and dataset.
const orgDisplayName = ORG_NAMES[org] || org;

export default {
  // Content to add to the head of the page, e.g. for a favicon:
  head: '<link rel="icon" href="observable.png" type="image/png" sizes="32x32"><link rel="stylesheet" href="print.css">',
  title: "Rhevia",
  root: "src",
  sidebar: true,
  pages: [
    {
      name: orgDisplayName,
      pages: [
        { name: "Executive Summary", path: `/${org}/` },
        { name: "Movement Report", path: `/${org}/movement-report` },
        { name: "Closing Remarks", path: `/${org}/closing-remarks` },
      ],
    },
  ],
  dynamicPaths: [
    `/${org}/`,
    `/${org}/movement-report`,
    `/${org}/closing-remarks`,
  ],

  // Some additional configuration options and their defaults:
  // theme: "default", // try "light", "dark", "slate", etc.
  header: "Rhevia: Movement Intelligence Report", // page header (defaults to title)
  footer: `Produced ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · Powered by Rhevia`,
  // sidebar: true, // whether to show the sidebar
  // toc: true, // whether to show the table of contents
  // pager: true, // whether to show previous & next links in the footer
  // output: "dist", // path to the output root for build
  // search: true, // activate search
  // linkify: true, // convert URLs in Markdown to links
  // typographer: false, // smart quotes and other typographic improvements
  // preserveExtension: false, // drop .html from URLs
  // preserveIndex: false, // drop /index from URLs
  // theme: ["dashboard", "midnight"],
};
