// Original explanatory copy, written for this practice — warm, reflective,
// and framed as a mirror for self-exploration, never as a clinical or
// scientific assessment. Nothing here is reproduced from Human Design
// publications (see C11 spec §6 licensing note).

import type { Center } from "./wheel";

export const REFLECTIVE_FRAMING =
  "Human Design is offered here as a reflective lens — a mirror to explore with curiosity, not a diagnosis or a measure of who you are. Take what resonates, leave what doesn't, and bring what surprises you into a session.";

export const TYPE_MEANING: Record<string, string> = {
  Generator:
    "You carry a steady, renewable life force. Things tend to go well when you let life come to you and notice what your energy rises to meet — and when you stop pushing toward what leaves you flat.",
  "Manifesting Generator":
    "You carry that same steady life force, with a fast, multi-passionate current running through it. Skipping steps, moving between projects, and course-correcting quickly aren't flaws — they're how your energy likes to move.",
  Manifestor:
    "You're built to initiate — to start things without waiting for permission. Letting the people in your orbit know what you're about to do isn't asking approval; it clears the path so your moves land with less resistance.",
  Projector:
    "You're built to see systems and people clearly, not to run on constant output. Your gifts land best where they're genuinely invited — and rest isn't a luxury for you, it's part of how your wisdom works.",
  Reflector:
    "You're a rare, open mirror for the world around you. Your experience shifts with your environment and with time, so the people and places you surround yourself with matter more for you than for anyone.",
};

// Keyed by the strategy string the engine produces (lib/human-design/engine.ts).
export const STRATEGY_MEANING: Record<string, string> = {
  "To respond":
    "Rather than chasing or forcing, let life bring things to you — a question, an offer, something to react to. Your energy commits truthfully when it's answering something real, and drains when it's pushing at nothing.",
  "To respond, then inform":
    "Let life bring things to you to respond to — and because you move fast and change lanes quickly, a simple heads-up to the people affected keeps your speed from leaving bruises. Respond first; inform as you move.",
  "To inform, then act":
    "You don't need to wait for permission — but a simple heads-up before you act clears the path. Informing isn't asking; it dissolves the resistance that otherwise meets your moves.",
  "To wait for the invitation":
    "For the big doors — love, work, where your gifts go — wait until you're genuinely seen and invited. Your wisdom lands when it's asked for; day-to-day life doesn't need an invitation, but the major commitments do.",
  "To wait a lunar cycle":
    "For big decisions, give yourself a full lunar cycle — about a month — and notice how the question feels as you move through different days and places. Time isn't delay for you; it's how your clarity arrives.",
};

export const AUTHORITY_MEANING: Record<string, string> = {
  Emotional:
    "Clarity comes to you over time, not in the moment. Feelings arrive in waves — the invitation is to sleep on the big decisions and notice what's still true once the wave has passed.",
  Sacral:
    "Your body answers before your mind does — an immediate rising \"uh-huh\" or a flat \"unh-uh.\" The practice is catching that gut response before the thinking starts negotiating with it.",
  Splenic:
    "Your knowing is quiet, instant, and doesn't repeat itself. It can feel like a whisper of yes/no or safe/not-safe in the moment — the work is trusting it before logic talks you out of it.",
  "Ego (manifested)":
    "Your truest yes comes from what you genuinely have the will and the heart for. If the commitment doesn't stir that, it's likely a no — however sensible it sounds.",
  "Ego (projected)":
    "Your truest yes comes from what you genuinely have the will and the heart for. Speaking it out loud — what's in it for your heart — often reveals the answer.",
  "Self-projected":
    "You hear your truth in your own voice. Talking decisions through with someone who simply listens — without advising — lets you hear where you're actually headed.",
  "Mental (sounding board)":
    "There's no single inner meter for you to consult; clarity comes from talking things through in environments that feel right, and noticing how the options land in different places and company.",
  Lunar:
    "Your clarity moves with the lunar cycle. Big decisions ripen over a full cycle (about a month) — giving them that time isn't slowness, it's your design.",
};

export const CENTER_LABEL: Record<Center, string> = {
  Head: "Head",
  Ajna: "Ajna",
  Throat: "Throat",
  G: "G (identity)",
  Heart: "Heart (will)",
  Sacral: "Sacral",
  Spleen: "Spleen",
  SolarPlexus: "Solar plexus",
  Root: "Root",
};

export const CENTER_MEANING: Record<Center, { defined: string; open: string }> = {
  Head: {
    defined: "A consistent source of questions and inspiration of your own.",
    open: "You amplify the questions around you — notice which ones are actually yours.",
  },
  Ajna: {
    defined: "A consistent way of processing and making sense of things.",
    open: "Flexible, open-minded thinking; certainty isn't required for wisdom.",
  },
  Throat: {
    defined: "A consistent voice — expression and action flow in a recognizable way.",
    open: "Your voice adapts to the room; timing and invitation change how you're heard.",
  },
  G: {
    defined: "A steady inner sense of identity and direction.",
    open: "Identity flavored by place and people — environment shapes how you feel about who you are.",
  },
  Heart: {
    defined: "Reliable willpower — you can make and keep promises from the heart.",
    open: "No fixed reservoir of will; there's nothing to prove, and over-promising drains you.",
  },
  Sacral: {
    defined: "Sustainable life-force energy that renews when you love what you're doing.",
    open: "You borrow and amplify others' energy — knowing when enough is enough is the practice.",
  },
  Spleen: {
    defined: "A steady in-the-moment sense of wellbeing, timing, and safety.",
    open: "Sensitive to others' fears and to holding on too long — what feels urgent may not be yours.",
  },
  SolarPlexus: {
    defined: "You generate emotional waves — feelings are information that ripen over time.",
    open: "You feel the room, often more strongly than the people in it — learning what's yours is freeing.",
  },
  Root: {
    defined: "A consistent relationship with pressure and drive.",
    open: "You amplify pressure and hurry to be free of it — most deadlines are softer than they feel.",
  },
};

export const LINE_MEANING: Record<number, string> = {
  1: "the investigator — grounded by understanding the foundations",
  2: "the natural — gifts that flow when called out, needing space to recharge",
  3: "the experimenter — wisdom built by trial, error, and honest revision",
  4: "the connector — opportunity moves through relationships and networks",
  5: "the practical one — others project big expectations; deliver what's real",
  6: "the role model — life in chapters: experiment, retreat, then embody",
};

export const DEFINITION_MEANING: Record<string, string> = {
  None: "With no fixed circuitry, you sample and reflect the energies around you.",
  Single: "Your defined centers run as one connected current — self-contained processing.",
  Split: "Your definition runs in two islands — certain people naturally feel like the bridge.",
  "Triple split": "Three islands of definition — varied company helps your processing feel whole.",
  "Quadruple split": "Four islands of definition — a rare, many-roomed inner world that benefits from patience.",
};
