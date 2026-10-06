import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const target = ".env.local";
if (existsSync(target)) {
  console.log(`${target} already exists - left unchanged.`);
} else {
  const secret = randomBytes(48).toString("base64url");
  const body = readFileSync(".env.example", "utf8").replace(/^SESSION_SECRET=.*$/m, `SESSION_SECRET=${secret}`);
  writeFileSync(target, body, { mode: 0o600 });
  console.log(`Created ${target} with a generated session secret.`);
}
