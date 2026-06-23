import crypto from "crypto";
import { env } from "../config/env.js";

type CloudinaryConfig = {
  apiKey?: string;
  apiSecret?: string;
  cloudName?: string;
};

const extractPublicIdFromUrl = (imageUrl: string) => {
  try {
    const url = new URL(imageUrl);
    const uploadIndex = url.pathname.indexOf("/upload/");

    if (uploadIndex === -1) {
      return null;
    }

    const uploadPath = url.pathname.slice(uploadIndex + "/upload/".length);
    const pathWithoutTransform = uploadPath.replace(
      /^(?:[^/]+,)*[^/]+\/(?=v\d+\/)/,
      "",
    );
    const pathWithoutVersion = pathWithoutTransform.replace(/^v\d+\//, "");
    const pathWithoutExtension = pathWithoutVersion.replace(/\.[^.\/]+$/, "");

    return decodeURIComponent(pathWithoutExtension);
  } catch {
    return null;
  }
};

const createCloudinaryService = ({
  apiKey,
  apiSecret,
  cloudName,
}: CloudinaryConfig) => {
  const deleteImageByUrl = async (imageUrl: string | null | undefined) => {
    if (!imageUrl) {
      return { deleted: false, reason: "missing_url" as const };
    }

    if (!apiKey || !apiSecret || !cloudName) {
      return { deleted: false, reason: "not_configured" as const };
    }

    const publicId = extractPublicIdFromUrl(imageUrl);

    if (!publicId) {
      return { deleted: false, reason: "invalid_url" as const };
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = crypto
      .createHash("sha1")
      .update(`public_id=${publicId}&timestamp=${timestamp}${apiSecret}`)
      .digest("hex");

    const body = new URLSearchParams({
      api_key: apiKey,
      public_id: publicId,
      signature,
      timestamp,
    });

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`,
      {
        method: "POST",
        body,
      },
    );

    if (!response.ok) {
      throw new Error(`Cloudinary delete failed with status ${response.status}`);
    }

    return { deleted: true, publicId };
  };

  return {
    deleteImageByUrl,
  };
};

export const cloudinaryService = createCloudinaryService({
  apiKey: env.CLOUDINARY_API_KEY,
  apiSecret: env.CLOUDINARY_API_SECRET,
  cloudName: env.CLOUDINARY_CLOUD_NAME,
});

export type CloudinaryService = ReturnType<typeof createCloudinaryService>;
export { createCloudinaryService, extractPublicIdFromUrl };
