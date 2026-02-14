import "dotenv/config";

const token = process.env.MAPBOX_TOKEN;
if (!token) throw new Error("MAPBOX_TOKEN is not set");
process.stdout.write(JSON.stringify(token));
