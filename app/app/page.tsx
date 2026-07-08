import { SignatureRule, Eyebrow } from "@/components/brand";

// C1 stub. C2 (the self-awareness log) fills this space in.
export default function ClientHome() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Eyebrow>Your space</Eyebrow>
        <h1 className="text-[2.25rem] font-semibold">Welcome</h1>
        <SignatureRule />
      </div>
      <div className="rounded-lg border border-line bg-white p-8 shadow-soft">
        <h2 className="text-xl font-semibold">Your space is ready</h2>
        <p className="mt-2 max-w-prose text-lg leading-relaxed text-ink">
          This is your private space between sessions. Logging your moments of awareness
          arrives next — for now, everything is set up and waiting for you.
        </p>
      </div>
    </div>
  );
}
