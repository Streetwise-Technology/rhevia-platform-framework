import "dotenv/config";

const org = process.env.ORG_SUBDOMAIN || "pip";
process.stdout.write(JSON.stringify(org));
