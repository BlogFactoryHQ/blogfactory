import { WorkOS } from "@workos-inc/node";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";

const apiKey = process.env.WORKOS_API_KEY?.trim();
const clientId = process.env.WORKOS_CLIENT_ID?.trim();
if (!apiKey || !clientId) throw new Error("WORKOS_API_KEY and WORKOS_CLIENT_ID are required");

const workos = new WorkOS({ apiKey, clientId });
const localUsers = await db.select().from(users);
let linked = 0;
let created = 0;

for (const local of localUsers) {
  if (local.workosUserId) continue;
  const existing = await workos.userManagement.listUsers({ email: local.email, limit: 1 });
  const remote = existing.data[0] || await workos.userManagement.createUser({
    email: local.email,
    name: local.displayName || undefined,
    emailVerified: local.emailVerified,
    externalId: local.id,
    passwordHash: local.passwordHash,
    passwordHashType: "bcrypt",
  });
  if (!existing.data[0]) created += 1;
  await db.update(users).set({ workosUserId: remote.id } as never).where(eq(users.id, local.id));
  linked += 1;
}

console.log(JSON.stringify({ scanned: localUsers.length, linked, created }));
