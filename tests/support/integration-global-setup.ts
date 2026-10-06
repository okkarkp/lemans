import { prepareTestDatabase } from "./test-db";

export default async function setup() {
  await prepareTestDatabase();
}
