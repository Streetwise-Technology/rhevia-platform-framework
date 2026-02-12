export default {
  // ontent to add to the head of the page, e.g. for a favicon:
  head: '<link rel="icon" href="observable.png" type="image/png" sizes="32x32">',
  title: "Movement Intelligence Report",
  root: "src",
  sidebar: true,
  pages: [
    {
      name: "Portsmouth International Port",
      pages: [
        { name: "Executive Summary", path: "/pip/" },
        { name: "Traffic Summary", path: "/pip/traffic-summary" },
        { name: "Zone Analysis", path: "/pip/zone-analysis" },
      ],
    },
  ],
  dynamicPaths: ["/pip", "/pip/traffic-summary", "/pip/zone-analysis"],

  // Some additional configuration options and their defaults:
  // theme: "default", // try "light", "dark", "slate", etc.
  // header: "", // what to show in the header (HTML)
  // footer: "Built with Observable.", // what to show in the footer (HTML)
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
