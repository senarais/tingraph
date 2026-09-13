"use client";

import Link from "next/link";
import {
  startTransition,
  useActionState,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { Camera, Pencil } from "lucide-react";
import {
  requestPasswordReset,
  signIn,
  signInWithGoogle,
  signUp,
  updatePassword,
} from "@/app/auth/actions";
import { updateProfile, uploadAvatar } from "@/app/profile/actions";
import {
  AVATAR_SIDE,
  PASSWORD_MIN,
  PROFILE_FIELDS,
  type FormState,
  type ProfileField,
  type ProfileInput,
} from "@/lib/auth";
import { Avatar } from "@/components/account/account-button";
import { Segmented, SlabButton, Tick } from "@/components/editor/ui";

/**
 * The account pages' forms. Each one posts to a Server Action and shows what
 * came back; none of them decides anything the action does not decide again.
 */

function Input({
  label,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="block">
      <Tick className="mb-1.5 block">{label}</Tick>
      <input
        {...props}
        className="w-full border-2 border-edge bg-white px-3 py-2 text-[13px] text-ink placeholder:text-ink-faint"
      />
      {hint && <span className="mt-1.5 block text-[11px] text-ink-faint">{hint}</span>}
    </label>
  );
}

function Message({ state }: { state: FormState }) {
  if (state.error) {
    return (
      <p
        role="alert"
        className="border-2 border-edge bg-alert-tint px-3 py-2 text-[12px] leading-relaxed text-alert"
      >
        {state.error}
      </p>
    );
  }
  if (state.notice) {
    return (
      <p
        role="status"
        className="border-2 border-edge bg-bone px-3 py-2 text-[12px] leading-relaxed text-ink"
      >
        {state.notice}
      </p>
    );
  }
  return null;
}

/** A section of the profile page: a title bar and whatever it holds. */
export function SectionHead({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="flex min-h-14 items-center gap-3 border-b-2 border-edge px-5 py-2.5">
      <h2 className="font-mono text-[13px] font-semibold text-ink">{title}</h2>
      {children}
    </header>
  );
}

const GOOGLE_MARK =
  "M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z";

// ---------------------------------------------------------------- signing in

function SignInForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signIn, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <Input
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state.values?.email}
      />
      <Input
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />
      <Message state={state} />
      <SlabButton type="submit" tone="solid" disabled={pending} className="w-full">
        {pending ? "Signing in…" : "Sign in"}
      </SlabButton>
      <p className="text-center text-[12px] text-ink-soft">
        <Link href="/forgot-password" className="underline underline-offset-4 hover:text-ink">
          Forgot your password?
        </Link>
      </p>
    </form>
  );
}

function SignUpForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signUp, {});
  if (state.notice) {
    return <Message state={state} />;
  }
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <Input
        label="Name"
        name="name"
        autoComplete="name"
        maxLength={80}
        hint="Optional. Shown on your profile."
        defaultValue={state.values?.name}
      />
      <Input
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state.values?.email}
      />
      <Input
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={PASSWORD_MIN}
        hint={`At least ${PASSWORD_MIN} characters.`}
      />
      <Message state={state} />
      <SlabButton type="submit" tone="solid" disabled={pending} className="w-full">
        {pending ? "Creating account…" : "Create account"}
      </SlabButton>
    </form>
  );
}

export function AuthForm({
  next,
  mode: initial,
  problem,
}: {
  next: string;
  mode: "signin" | "signup";
  /** what went wrong on the way back from a link, already in words */
  problem?: string;
}) {
  const [mode, setMode] = useState(initial);
  return (
    <div className="space-y-5">
      {problem && <Message state={{ error: problem }} />}
      <Segmented
        options={[
          { value: "signin" as const, label: "Sign in" },
          { value: "signup" as const, label: "Create account" },
        ]}
        value={mode}
        onChange={setMode}
      />
      <form action={signInWithGoogle}>
        <input type="hidden" name="next" value={next} />
        <SlabButton type="submit" className="w-full">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
            <path d={GOOGLE_MARK} />
          </svg>
          Continue with Google
        </SlabButton>
      </form>
      <div className="flex items-center gap-3">
        <span className="h-0.5 flex-1 bg-edge" />
        <Tick>or with email</Tick>
        <span className="h-0.5 flex-1 bg-edge" />
      </div>
      {/* keyed by the tab, so switching drops whatever the other form said */}
      {mode === "signin" ? <SignInForm key="in" next={next} /> : <SignUpForm key="up" next={next} />}
    </div>
  );
}

// ---------------------------------------------------------------- passwords

export function ForgotForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, {});
  if (state.notice) {
    return <Message state={state} />;
  }
  return (
    <form action={action} className="space-y-4">
      <p className="text-[13px] leading-relaxed text-ink-soft">
        Enter the email you signed up with, and a link to set a new password
        will be sent to it.
      </p>
      <Input
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state.values?.email}
      />
      <Message state={state} />
      <SlabButton type="submit" tone="solid" disabled={pending} className="w-full">
        {pending ? "Sending…" : "Send the link"}
      </SlabButton>
    </form>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, {});
  return (
    <form action={action} className="space-y-4">
      <Input
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={PASSWORD_MIN}
        hint={`At least ${PASSWORD_MIN} characters.`}
      />
      <Input
        label="Repeat it"
        name="confirm"
        type="password"
        autoComplete="new-password"
        required
        minLength={PASSWORD_MIN}
      />
      <Message state={state} />
      <SlabButton type="submit" tone="solid" disabled={pending}>
        {pending ? "Saving…" : "Update password"}
      </SlabButton>
    </form>
  );
}

// ------------------------------------------------------------------ profile

/** Written into the empty fields, to say what kind of thing goes there. */
const PLACEHOLDERS: Partial<Record<ProfileField, string>> = {
  username: "your_name",
  profession: "Student, researcher, analyst…",
  affiliation: "University, company or lab",
  location: "City, country",
  website: "example.com",
};

function Shown({ field, value }: { field: ProfileField; value: string | null }) {
  if (!value) {
    return <span className="text-ink-faint">Not set</span>;
  }
  if (field === "username") {
    return <span className="font-mono">@{value}</span>;
  }
  if (field === "website") {
    return (
      <a
        href={value}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="underline underline-offset-4 hover:text-ink-soft"
      >
        {value.replace(/^https?:\/\//, "").replace(/\/$/, "")}
      </a>
    );
  }
  return <>{value}</>;
}

export function ProfileDetails({ profile }: { profile: ProfileInput }) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(
    async (previous: FormState, form: FormData) => {
      const result = await updateProfile(previous, form);
      if (!result.error) {
        setEditing(false);
      }
      return result;
    },
    {},
  );
  // a refused form comes back as it was typed; anything else starts from the record
  const initial = (field: ProfileField) =>
    state.error ? (state.values?.[field] ?? "") : (profile[field] ?? "");
  const fields = (Object.keys(PROFILE_FIELDS) as ProfileField[]).filter((field) => field !== "bio");

  return (
    <section id="details" className="slab scroll-mt-20 bg-white">
      <SectionHead title="Details">
        {!editing && (
          <SlabButton onClick={() => setEditing(true)} className="ml-auto">
            <Pencil size={13} />
            Edit
          </SlabButton>
        )}
      </SectionHead>

      {editing ? (
        <form action={action} className="grid gap-4 p-5 sm:grid-cols-2">
          {fields.map((field) => (
            <Input
              key={field}
              label={PROFILE_FIELDS[field].label}
              name={field}
              maxLength={PROFILE_FIELDS[field].max}
              placeholder={PLACEHOLDERS[field]}
              inputMode={field === "website" ? "url" : undefined}
              autoComplete={field === "full_name" ? "name" : "off"}
              defaultValue={initial(field)}
            />
          ))}
          <label className="block sm:col-span-2">
            <Tick className="mb-1.5 block">{PROFILE_FIELDS.bio.label}</Tick>
            <textarea
              name="bio"
              rows={4}
              maxLength={PROFILE_FIELDS.bio.max}
              defaultValue={initial("bio")}
              placeholder="A line or two about what you draw and why."
              className="w-full resize-y border-2 border-edge bg-white px-3 py-2 text-[13px] leading-relaxed text-ink placeholder:text-ink-faint"
            />
          </label>
          {state.error && (
            <div className="sm:col-span-2">
              <Message state={{ error: state.error }} />
            </div>
          )}
          <div className="flex gap-2 sm:col-span-2 sm:justify-end">
            <SlabButton onClick={() => setEditing(false)}>Cancel</SlabButton>
            <SlabButton type="submit" tone="solid" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </SlabButton>
          </div>
        </form>
      ) : (
        <div className="p-5">
          <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
            {fields.map((field) => (
              <div key={field} className="min-w-0">
                <dt>
                  <Tick>{PROFILE_FIELDS[field].label}</Tick>
                </dt>
                <dd className="mt-1.5 break-words text-[13.5px] text-ink">
                  <Shown field={field} value={profile[field]} />
                </dd>
              </div>
            ))}
            <div className="min-w-0 sm:col-span-2 lg:col-span-3">
              <dt>
                <Tick>{PROFILE_FIELDS.bio.label}</Tick>
              </dt>
              <dd className="mt-1.5 whitespace-pre-line break-words text-[13.5px] leading-relaxed text-ink">
                <Shown field="bio" value={profile.bio} />
              </dd>
            </div>
          </dl>
          {state.notice && (
            <div className="mt-5">
              <Message state={{ notice: state.notice }} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Cut the middle square out of a picture and shrink it, so what is sent is a
 * few kilobytes rather than a photo straight off a phone.
 */
async function square(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIDE;
  canvas.height = AVATAR_SIDE;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("no 2d context");
  }
  context.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    AVATAR_SIDE,
    AVATAR_SIDE,
  );
  bitmap.close();
  // a browser that cannot write WebP hands back a PNG, which is also accepted
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.86),
  );
  if (!blob) {
    throw new Error("the picture could not be encoded");
  }
  return blob;
}

export function AvatarUpload({ url, name }: { url: string | null; name: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [state, action, pending] = useActionState(uploadAvatar, {});
  const [unreadable, setUnreadable] = useState(false);

  const choose = async (file: File) => {
    setUnreadable(false);
    let picture: Blob;
    try {
      picture = await square(file);
    } catch {
      setUnreadable(true);
      return;
    }
    const form = new FormData();
    form.set("avatar", new File([picture], "avatar", { type: picture.type }));
    startTransition(() => action(form));
  };

  const problem = unreadable ? "That picture could not be read." : state.error;
  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <Avatar url={url} name={name} className="h-24 w-24 text-3xl" />
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={pending}
          title="Change your picture"
          aria-label="Change your picture"
          className="slab-tight press absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center bg-white text-ink disabled:cursor-wait disabled:opacity-40"
        >
          <Camera size={14} />
        </button>
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            // cleared, so choosing the same file again still counts as a change
            event.target.value = "";
            if (file) {
              void choose(file);
            }
          }}
        />
      </div>
      {pending && <p className="mt-3 text-[11px] text-ink-faint">Uploading…</p>}
      {problem && !pending && (
        <p role="alert" className="mt-3 text-[11px] text-alert">
          {problem}
        </p>
      )}
    </div>
  );
}
