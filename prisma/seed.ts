import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_PRACTITIONER_EMAIL ?? "valentina@example.com";
  const password = process.env.SEED_PRACTITIONER_PASSWORD ?? "changeme-now";
  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name: "Valentina", role: "PRACTITIONER", passwordHash },
  });

  console.log(`Seeded practitioner: ${email}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
