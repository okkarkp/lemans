import { prepareTestDatabase } from "./test-db";

export default async function globalSetup() {
  await prepareTestDatabase();
}
