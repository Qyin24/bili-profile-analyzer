/**
 * Inspect isTest markers / existence for given task IDs (local dev verification).
 * Usage: npx tsx scripts/probes/check-istest.ts <taskId> [taskId ...]
 */
import { resolve } from "path";
import { prisma } from "../../src/lib/prisma";

try {
  (process as unknown as { loadEnvFile: (p: string) => void }).loadEnvFile(
    resolve(process.cwd(), ".env")
  );
} catch {
  /* best-effort */
}

async function main() {
  const ids = process.argv.slice(2);
  for (const id of ids) {
    const t = await prisma.analysisTask.findUnique({
      where: { id },
      select: { id: true, isTest: true, targetId: true },
    });
    if (!t) {
      console.log(`${id}\tEXISTS=false`);
      continue;
    }
    const tg = await prisma.analysisTarget.findUnique({
      where: { id: t.targetId },
      select: { id: true, isTest: true },
    });
    console.log(`${id}\ttask.isTest=${t.isTest}\ttargetId=${t.targetId}\ttarget.isTest=${tg?.isTest ?? "GONE"}\ttargetExists=${!!tg}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
