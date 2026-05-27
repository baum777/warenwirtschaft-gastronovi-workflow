import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

config({ path: ".env" });
config({ path: ".env.example", override: false });

export default defineConfig({
  engine: "classic",
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DIRECT_URL")
  }
});
