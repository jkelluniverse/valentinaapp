import { randomInt, randomUUID } from "crypto";

// PLATFORM Phase 4 — the card-draw engine for the SESSION-class module.
// Event-based by nature: a draw happens in the moment and is stored as a
// dated reading; it is NEVER derived from intake data (spec §5, honest
// handling). Deck naming is the traditional public-domain vocabulary
// (Rule 0.4 — no deck-brand trademarks in code).

const MAJORS = [
  "The Fool", "The Magician", "The High Priestess", "The Empress", "The Emperor",
  "The Hierophant", "The Lovers", "The Chariot", "Strength", "The Hermit",
  "Wheel of Fortune", "Justice", "The Hanged One", "Death", "Temperance",
  "The Devil", "The Tower", "The Star", "The Moon", "The Sun", "Judgement", "The World",
];
const RANKS = ["Ace", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Page", "Knight", "Queen", "King"];
const SUITS = ["Wands", "Cups", "Swords", "Pentacles"];

export const DECK: readonly string[] = [
  ...MAJORS,
  ...SUITS.flatMap((suit) => RANKS.map((rank) => `${rank} of ${suit}`)),
]; // 22 + 56 = 78

export const SPREADS: Record<string, { label: string; positions: string[] }> = {
  single: { label: "Single card", positions: ["Focus"] },
  "three-card": { label: "Three cards", positions: ["Past", "Present", "Future"] },
  "five-card": { label: "Five cards", positions: ["Situation", "Challenge", "Guidance", "Foundation", "Potential"] },
};

export type DrawnCard = { position: string; card: string; reversed: boolean };
export type Draw = { drawId: string; spread: string; cards: DrawnCard[]; drawnAt: string };

export function drawCards(spreadKey: string, allowReversed = true): Draw {
  const spread = SPREADS[spreadKey] ?? SPREADS.single;
  // Fisher–Yates over a copy with crypto randomness — no repeats in a draw.
  const deck = [...DECK];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  const cards = spread.positions.map((position, i) => ({
    position,
    card: deck[i],
    reversed: allowReversed ? randomInt(2) === 1 : false,
  }));
  return { drawId: randomUUID(), spread: spreadKey, cards, drawnAt: new Date().toISOString() };
}
