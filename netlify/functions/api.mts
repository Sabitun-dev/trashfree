import type { Config } from "@netlify/functions";
import { buildApi } from "../../src/server/api/app";

const app = buildApi();

export default (req: Request) => app.fetch(req);

export const config: Config = { path: "/api/*" };
