import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { getOrCreateConversation, listMessageViews, markRead, getAwayNote } from "@/lib/messaging";
import { referenceableFor } from "@/lib/message-refs";
import { CRISIS_RESOURCES } from "@/lib/message-safety";
import { displayName, firstNameOf } from "@/lib/name";
import { ThreadScreen } from "@/components/ThreadScreen";
import { PendingButton } from "@/components/PendingButton";
import { sendPractitionerMessage, pollPractitioner, pauseThread, acknowledgeFlag } from "../actions";

export const dynamic = "force-dynamic";

// AMENDMENT-04 §2b/§2c — THE one thread implementation. The inbox row and the
// Portrait's shortcut row both deep-link here. Fixed three-layer screen; the
// name in the header opens the Portrait.
export default async function PractitionerThread({ params }: { params: { clientId: string } }) {
  await requirePractitioner();

  const client = await prisma.user.findFirst({
    where: { id: params.clientId, role: "CLIENT" },
    select: { id: true, name: true, email: true },
  });
  if (!client) notFound();

  const convo = await getOrCreateConversation(client.id);
  if (!convo) notFound();
  await markRead(convo.id, "PRACTITIONER");

  const [initial, refGroups, awayNote, flagged] = await Promise.all([
    listMessageViews(convo.id, { role: "PRACTITIONER", clientId: client.id }),
    referenceableFor({ role: "PRACTITIONER", clientId: client.id }),
    getAwayNote(),
    prisma.message.findMany({
      where: { conversationId: convo.id, safetyFlag: true, safetyCleared: false, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    }),
  ]);

  const name = displayName(client);
  const paused = convo.status === "PAUSED";

  // Thread options — pause/reopen + crisis acknowledgements, served into the
  // ⋯ sheet. Server-action forms cross into the client component as RSC nodes.
  const menu = (
    <div className="flex flex-col gap-3">
      {flagged.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border-2 border-rose bg-white p-3">
          <p className="text-[13px] text-ink">
            They reached out in distress and were shown crisis resources. When you&apos;ve checked
            in, set it down:
          </p>
          {flagged.map((f) => (
            <form key={f.id} action={acknowledgeFlag.bind(null, client.id, f.id)}>
              <PendingButton className="min-h-[40px] w-full rounded-md border border-rose text-sm font-medium text-rose transition-colors hover:bg-rose hover:text-white">
                I&apos;ve checked in
              </PendingButton>
            </form>
          ))}
        </div>
      )}
      <form action={pauseThread.bind(null, client.id, !paused)}>
        <PendingButton className="min-h-[44px] w-full rounded-lg border border-line text-sm font-medium text-ink transition-colors hover:border-wine hover:text-wine">
          {paused ? "Reopen this line" : "Pause this line"}
        </PendingButton>
      </form>
      <p className="text-[12px] text-whisper">
        {paused
          ? "Paused — nothing new can be sent until you reopen it."
          : "Pausing holds the line; they'll see a gentle note instead of the composer."}
      </p>
    </div>
  );

  return (
    <ThreadScreen
      viewerRole="PRACTITIONER"
      counterpartName={firstNameOf(name)}
      counterpartInitial={(name[0] ?? "·").toUpperCase()}
      backHref="/practitioner/messages"
      nameHref={`/practitioner/clients/${client.id}`}
      initial={initial}
      refGroups={refGroups}
      paused={paused}
      topNote={awayNote ? `Your away note is up: “${awayNote}”` : null}
      crisisResources={CRISIS_RESOURCES}
      menu={menu}
      send={sendPractitionerMessage.bind(null, client.id)}
      poll={pollPractitioner.bind(null, client.id)}
    />
  );
}
