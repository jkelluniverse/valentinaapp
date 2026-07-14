// C18 — Valentina's public marketing copy, structured. Sourced from her live
// site (valentinavelez.com) and reused faithfully; wording is HERS and any
// polish is pending her sign-off (C18 §10.2). This module holds ONLY static
// marketing strings — it imports nothing and reads no data, so it is safe for
// the public wall (C18 §2).
//
// Scope-of-practice note (C18 §10.3): her existing language is carried over
// as-is; we introduce no new clinical/treatment claims. Coaching, not treatment.

export const SITE = {
  practitioner: "Valentina Vélez",
  credential: "Neuropsychology Specialist & Psych-K® Consultant",
  // Set NEXT_PUBLIC_SITE_URL in the environment (the launch subdomain, later the
  // custom domain). Used for canonical + OpenGraph URLs and the sitemap.
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://valentinavelez.com",

  hero: {
    headline: "Rewrite Your Subconscious Mind, Transform Your Life.",
    subhead:
      "Harness the power of neuropsychology and Psych-K® to break free from self-sabotage, release past trauma, and unlock your fullest potential.",
    cta: "Book a free discovery call",
  },

  about: {
    eyebrow: "Meet Valentina",
    heading: "A neuropsychology specialist for lasting change",
    body: [
      "I'm a Neuropsychology Specialist committed to helping you shift deep-rooted beliefs and patterns at the subconscious level.",
      "I blend cutting-edge neuroscience with the power of Psych-K® to help you reprogram self-sabotaging behaviors, heal from past trauma, and experience sustainable, life-changing results.",
    ],
  },

  program: {
    eyebrow: "The path",
    heading: "A three-phase program",
    intro:
      "Change that holds isn't a single breakthrough — it's a path. We walk it together, from the first pressing challenge to a rhythm you can keep on your own.",
    phases: [
      {
        name: "Acute Phase",
        focus: "Immediate transformation",
        body: "We tackle what's most pressing right now through focused, dynamic interventions — real movement where you need it first.",
      },
      {
        name: "Transition Phase",
        focus: "Building resilience & independence",
        body: "You learn self-management techniques and carry more of the work yourself, so the change becomes yours to sustain.",
      },
      {
        name: "Maintenance Phase",
        focus: "Sustaining long-term change",
        body: "Periodic tune-ups keep the new patterns steady as life keeps moving — support that meets you at the pace you need.",
      },
    ],
  },

  process: {
    eyebrow: "How it works",
    heading: "The core process",
    steps: [
      { name: "Awareness & assessment", body: "We name what's really running underneath — the beliefs and patterns beneath the surface." },
      { name: "Subconscious reprogramming", body: "Using Psych-K®, we shift those beliefs at the level where they actually live." },
      { name: "Integration & elevation", body: "The new patterns settle into daily life, and you rise into what they make possible." },
    ],
  },

  testimonials: [
    {
      quote:
        "Valentina gave me practical tools and a clear roadmap — I finally understood what to do, not just what was wrong.",
      attribution: "Alex H.",
      location: "Florida",
    },
    {
      quote:
        "I went from imposter syndrome to real professional confidence. The change held because it came from the inside.",
      attribution: "Sarah M.",
      location: "Florida",
    },
  ],

  closing: {
    heading: "Schedule your transformation today",
    body: "A free discovery call is a relaxed, no-pressure conversation — we'll talk about what brought you here and whether this work is the right fit. That's it.",
    cta: "Book a free discovery call",
  },
} as const;

export type SiteContent = typeof SITE;
