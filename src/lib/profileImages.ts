import { supabase } from "./supabase";

export const profilePicturesBucket = "profile-pictures";

type UploadProfileImageInput = {
  contentType: "image/jpeg" | "image/png" | "image/webp";
  uri: string;
};

export async function uploadProfileImage(input: UploadProfileImageInput) {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

  if (sessionError) {
    throw sessionError;
  }

  const userId = sessionData.session?.user.id;

  if (!userId) {
    throw new Error("Sign in before uploading a profile picture.");
  }

  const response = await fetch(input.uri);
  const body = await response.arrayBuffer();
  const extension = extensionForContentType(input.contentType);
  const path = `${userId}/avatar-${Date.now()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from(profilePicturesBucket)
    .upload(path, body, {
      contentType: input.contentType,
      upsert: true
    });

  if (uploadError) {
    throw uploadError;
  }

  return {
    path,
    publicUrl: publicProfileImageUrl(path)
  };
}

export function publicProfileImageUrl(path: string) {
  if (!supabase) {
    return null;
  }

  return supabase.storage.from(profilePicturesBucket).getPublicUrl(path).data.publicUrl;
}

function extensionForContentType(contentType: UploadProfileImageInput["contentType"]) {
  switch (contentType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
  }
}
