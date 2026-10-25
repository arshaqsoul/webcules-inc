"use client";

/* "New gallery" entry point on the Galleries overview (WEBC-115): pick the
 * project, land on its Client gallery tab where links are actually created.
 * Routing only — no gallery is created here. */
import { useRouter } from "next/navigation";
import { useState } from "react";

export function NewGalleryPicker({ projects }: { projects: { id: string; title: string }[] }) {
  const router = useRouter();
  const [picking, setPicking] = useState(false);

  if (projects.length === 0) {
    return (
      <a
        href="/dashboard/projects"
        className="rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
      >
        New gallery — create a project first
      </a>
    );
  }

  if (!picking) {
    return (
      <button
        type="button"
        onClick={() => setPicking(true)}
        className="rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
      >
        New gallery
      </button>
    );
  }

  return (
    <label className="flex items-center gap-2 text-xs text-ink-muted">
      New gallery for
      <select
        autoFocus
        defaultValue=""
        aria-label="Pick a project for the new gallery"
        onChange={(e) => {
          const id = e.target.value;
          if (id) router.push(`/dashboard/projects/${id}?tab=gallery`);
        }}
        className="snap-select rounded-md border border-hairline bg-canvas px-2 py-2 text-xs text-ink outline-none"
      >
        <option value="" disabled>
          Pick a project…
        </option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.title}
          </option>
        ))}
      </select>
    </label>
  );
}
