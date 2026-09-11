import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_PRACTITIONER_EMAIL ?? "valentina@example.com";
  const password = process.env.SEED_PRACTITIONER_PASSWORD ?? "changeme-now";
  const passwordHash = await bcrypt.hash(password, 12);

  const practitioner = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name: "Valentina", role: "PRACTITIONER", active: true, passwordHash },
  });

  console.log(`Seeded practitioner: ${email}`);

  // C3: placeholder library items — clearly marked; replaced by Valentina's
  // real prompts/exercises (worksheet §10). Idempotent: only seeds when empty.
  const promptCount = await prisma.prompt.count();
  if (promptCount === 0) {
    await prisma.prompt.createMany({
      data: [
        {
          kind: "PROMPT",
          title: "[Placeholder] What kept showing up this week?",
          body: "Think back over the last few days. Is there a thought, feeling, or situation that kept returning? Describe one moment where you noticed it.",
          createdById: practitioner.id,
        },
        {
          kind: "EXERCISE",
          title: "[Placeholder] Two-minute grounding",
          body: "Find a quiet spot. Take five slow breaths, noticing the exhale. Then write one sentence about where you feel tension in your body right now.",
          createdById: practitioner.id,
        },
        {
          kind: "CHECK_IN",
          title: "[Placeholder] Quick check-in",
          body: "How are you arriving today? Pick the intensity that fits and add a line if you'd like.",
          createdById: practitioner.id,
        },
      ],
    });
    console.log("Seeded 3 placeholder library items");
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
