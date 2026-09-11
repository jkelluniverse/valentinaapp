import { requireClient } from "@/lib/auth-guards";
import { ThreadScreen } from "@/components/ThreadScreen";
import {
  getOrCreateConversation,
  listMessageViews,
  markRead,
  getAwayNote,
  RESPONSE_RHYTHM,
} from "@/lib/messaging";
import { referenceableFor } from "@/lib/message-refs";
import { CRISIS_RESOURCES } from "@/lib/message-safety";
import { sendClientMessage, pollClient } from "./actions";

export const dynamic = "force-dynamic";

// C15 + AMENDMENT-04 — the client's one thread, as a fixed native screen:
// header · scrolling messages · pinned composer. The away note / response
// rhythm shows as a quiet system line at the top of the thread.
export default async function MessagesPage() {
  const user = await requireClient();
  const convo = await getOrCreateConversation(user.id);

  if (!convo) {
    return <p className="py-10 text-center text-ink">Messaging isn&apos;t set up yet.</p>;
  }

  await markRead(convo.id, "CLIENT");
  const [initial, refGroups, awayNote] = await Promise.all([
    listMessageViews(convo.id, { role: "CLIENT", clientId: user.id }),
    referenceableFor({ role: "CLIENT", clientId: user.id }),
    getAwayNote(),
  ]);

  return (
    <ThreadScreen
      viewerRole="CLIENT"
      counterpartName="Valentina"
      counterpartInitial="V"
      backHref="/space"
      initial={initial}
      refGroups={refGroups}
      paused={convo.status === "PAUSED"}
      topNote={awayNote || RESPONSE_RHYTHM}
      crisisResources={CRISIS_RESOURCES}
      send={sendClientMessage.bind(null, convo.id)}
      poll={pollClient.bind(null, convo.id)}
    />
  );
}
