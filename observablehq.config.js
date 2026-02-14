export default {
  // ontent to add to the head of the page, e.g. for a favicon:
  head: '<link rel="icon" href="observable.png" type="image/png" sizes="32x32">',
  title: "Rhevia",
  root: "src",
  sidebar: true,
  pages: [
    {
      name: "Portsmouth International Port",
      pages: [
        { name: "Executive Summary", path: "/pip/" },
        { name: "Movement Report", path: "/pip/movement-report" },
        { name: "Closing Remarks", path: "/pip/closing-remarks" },
      ],
    },
  ],
  dynamicPaths: ["/pip/", "/pip/movement-report", "/pip/closing-remarks"],

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
