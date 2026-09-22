/**
 * The account rules that need no server to be judged. They sit apart from the
 * actions so `scripts/editor-check.ts` can hold them to their word, and so a
 * form and the action behind it quote one set of limits.
 *
 * The Go API repeats every limit here and PostgreSQL enforces it again.
 */

/** What a form action hands back to the form that sent it. */
export interface FormState {
  error?: string;
  notice?: string;
  /** what was typed, so a refused form comes back filled in rather than blank */
  values?: Record<string, string>;
}

export const PASSWORD_MIN = 15;

/**
 * Where a sign-in may send the reader afterwards: a path on this site, never
 * another host. The value is parsed rather than prefix-checked, because a
 * browser reads `//host`, `/\host` and `/<tab>/host` all as somewhere else.
 */
export function safeNext(value: unknown, fallback = "/profile"): string {
  if (typeof value !== "string" || !value.startsWith("/")) {
    return fallback;
  }
  const base = "http://tingraph.invalid";
  try {
    const url = new URL(value, base);
    return url.origin === base ? `${url.pathname}${url.search}${url.hash}` : fallback;
  } catch {
    return fallback;
  }
}

/** What the profile page edits, in the order it shows them, with the table's limits. */
export const PROFILE_FIELDS = {
  full_name: { label: "Full name", max: 80 },
  username: { label: "Username", max: 24 },
  profession: { label: "Profession", max: 60 },
  affiliation: { label: "Affiliation", max: 100 },
  location: { label: "Location", max: 80 },
  website: { label: "Website", max: 200 },
  bio: { label: "Bio", max: 280 },
} as const;

export type ProfileField = keyof typeof PROFILE_FIELDS;
export type ProfileInput = Record<ProfileField, string | null>;

const USERNAME = /^[a-z0-9_]{3,24}$/;

/** A web address as the table stores it, or null for anything that is not one. */
function asWebsite(value: string): string | null {
  if (/\s/.test(value)) {
    return null;
  }
  const written = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(written);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

/** A profile form read into what the table will take, or the first thing it would refuse. */
export function readProfile(form: FormData): { profile: ProfileInput } | { error: string } {
  const profile = {} as ProfileInput;
  for (const field of Object.keys(PROFILE_FIELDS) as ProfileField[]) {
    const { label, max } = PROFILE_FIELDS[field];
    const entry = form.get(field);
    let value = typeof entry === "string" ? entry.trim() : "";

    if (field === "username") {
      value = value.replace(/^@/, "").toLowerCase();
    }
    if (field === "website" && value !== "") {
      const url = asWebsite(value);
      if (!url) {
        return { error: "Website has to be a web address, like https://example.com." };
      }
      value = url;
    }
    if (value.length > max) {
      return { error: `${label} can be at most ${max} characters.` };
    }
    if (field === "username" && value !== "" && !USERNAME.test(value)) {
      return { error: "Username takes 3 to 24 lowercase letters, digits or underscores." };
    }
    profile[field] = value === "" ? null : value;
  }
  return { profile };
}

export const AVATAR_TYPES = ["image/webp", "image/png", "image/jpeg"];
/** Far above what a cut-down picture weighs, and under the 1MB a Server Action accepts. */
export const AVATAR_MAX_BYTES = 512 * 1024;
/** The side of the square a picture is cut to before it leaves the browser. */
export const AVATAR_SIDE = 256;

export function avatarProblem(file: { type: string; size: number }): string | null {
  if (!AVATAR_TYPES.includes(file.type)) {
    return "Use a PNG, JPEG or WebP picture.";
  }
  if (file.size === 0 || file.size > AVATAR_MAX_BYTES) {
    return "That picture is too large.";
  }
  return null;
}
