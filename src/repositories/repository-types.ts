import type { ClientSession } from "mongoose";

export type RepositoryOptions = {
  session?: ClientSession;
};

// SECURITY EVENTS TYPE

export type RequestMetadata = {
  requestId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  deviceName: string | null;
};

export type LocationMetadata = {
  country: string | null;
  region: string | null;
  city: string | null;
};
