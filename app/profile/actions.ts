"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PROFILE_FIELDS, avatarProblem, readProfile, type FormState } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** The signed-in reader, or off to sign in: every edit here is a POST anyone can send. */
async function owner() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    redirect("/login?next=/profile");
  }
  return { supabase, id: data.claims.sub };
}

export async function updateProfile(_: FormState, form: FormData): Promise<FormState> {
  const { supabase, id } = await owner();
  const values = Object.fromEntries(
    Object.keys(PROFILE_FIELDS).map((field) => [field, String(form.get(field) ?? "")]),
  );
  const read = readProfile(form);
  if ("error" in read) {
    return { error: read.error, values };
  }

  const { error } = await supabase
    .from("profiles")
    .update(read.profile)
    .eq("id", id)
    .select("id")
    .single();
  if (error) {
    return {
      error: error.code === "23505" ? "That username is taken." : "Your profile could not be saved.",
      values,
    };
  }
  revalidatePath("/profile");
  return { notice: "Profile saved." };
}

const EXTENSIONS: Record<string, string> = {
  "image/webp": "webp",
  "image/png": "png",
  "image/jpeg": "jpg",
};

export async function uploadAvatar(_: FormState, form: FormData): Promise<FormState> {
  const { supabase, id } = await owner();
  const file = form.get("avatar");
  if (!(file instanceof File)) {
    return { error: "Choose a picture first." };
  }
  const problem = avatarProblem(file);
  if (problem) {
    return { error: problem };
  }

  // a new name every time: a picture's address is cached for a year, so
  // writing over the old one would keep showing the old face
  const path = `${id}/${Date.now()}.${EXTENSIONS[file.type]}`;
  const bucket = supabase.storage.from("avatars");
  const uploaded = await bucket.upload(path, file, {
    contentType: file.type,
    cacheControl: "31536000",
  });
  if (uploaded.error) {
    return { error: "That picture could not be uploaded." };
  }

  const { publicUrl } = bucket.getPublicUrl(path).data;
  const saved = await supabase
    .from("profiles")
    .update({ avatar_url: publicUrl })
    .eq("id", id)
    .select("id")
    .single();
  if (saved.error) {
    await bucket.remove([path]);
    return { error: "That picture could not be saved." };
  }

  // the pictures it replaced are pointed at by nothing now
  const { data: files } = await bucket.list(id);
  const stale = (files ?? [])
    .map((item) => `${id}/${item.name}`)
    .filter((name) => name !== path);
  if (stale.length > 0) {
    await bucket.remove(stale);
  }

  revalidatePath("/profile");
  return { notice: "Picture updated." };
}
