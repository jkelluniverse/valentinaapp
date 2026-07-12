import { requireClient } from "@/lib/auth-guards";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { MessageThread } from "@/components/MessageThread";
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

// C15 — the client's open line to Valentina. One thread, calm and unhurried.
export default async function MessagesPage() {
  const user = await requireClient();
  const convo = await getOrCreateConversation(user.id);

  if (!convo) {
    return (
      <div className="flex flex-col gap-2">
        <Eyebrow>Your line</Eyebrow>
        <h1 className="text-[2.25rem] font-semibold">Messages</h1>
        <SignatureRule />
        <p className="mt-2 text-ink">Messaging isn&apos;t set up yet.</p>
      </div>
    );
  }

  await markRead(convo.id, "CLIENT");
  const [initial, refGroups, awayNote] = await Promise.all([
    listMessageViews(convo.id, { role: "CLIENT", clientId: user.id }),
    referenceableFor({ role: "CLIENT", clientId: user.id }),
    getAwayNote(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Eyebrow>Your line</Eyebrow>
        <h1 className="text-[2.125rem] font-medium text-ink-strong font-headline">
          Messages with Valentina
        </h1>
        <SignatureRule />
        <p className="max-w-prose text-sm text-slate">
          A quiet, held line between your sessions. Share what&apos;s on your mind, ask a question,
          or bring something up.
          {!user.consentAt && " (Until your consent is on record, messages here stay just between you two.)"}
        </p>
      </div>

      <MessageThread
        viewerRole="CLIENT"
        counterpartName="Valentina"
        initial={initial}
        refGroups={refGroups}
        paused={convo.status === "PAUSED"}
        awayNote={awayNote}
        responseRhythm={RESPONSE_RHYTHM}
        crisisResources={CRISIS_RESOURCES}
        send={sendClientMessage.bind(null, convo.id)}
        poll={pollClient.bind(null, convo.id)}
      />
    </div>
  );
}
