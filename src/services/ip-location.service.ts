import maxmind, { type CityResponse, type Reader } from "maxmind";
import net from "node:net";
import path from "node:path";
import { env } from "../config/env.js";
import { LocationMetadata } from "../types/repository-types.js";
import {
  getRequestMetadata,
  isPrivateIpAddress,
} from "../utils/request-metadata.js";
import { Request } from "express";

type IpLocation = {
  country: string | null;
  region: string | null;
  city: string | null;
  timezone: string | null;
  latitude: number | null;
  longitude: number | null;
  provider: "maxmind";
};

let cityLookup: Reader<CityResponse> | null = null;

const emptyLocation: IpLocation = {
  country: null,
  region: null,
  city: null,
  timezone: null,
  latitude: null,
  longitude: null,
  provider: "maxmind",
};

export async function initIpLocationService() {
  const dbPath = path.resolve(env.MAXMIND_DB_PATH);
  cityLookup = await maxmind.open<CityResponse>(dbPath);
  console.log("MaxMind GeoLite2 database loaded");
}

export function getLocationFromIp(ipAddress: string | null): IpLocation {
  if (!ipAddress || !cityLookup) {
    return emptyLocation;
  }

  const ip = ipAddress.trim();

  if (!net.isIP(ip) || isPrivateIpAddress(ip)) {
    return emptyLocation;
  }

  const result = cityLookup.get(ip);

  if (!result) {
    return emptyLocation;
  }

  return {
    country: result.country?.names?.en ?? null,
    region: result.subdivisions?.[0]?.names?.en ?? null,
    city: result.city?.names?.en ?? null,
    timezone: result.location?.time_zone ?? null,
    latitude: result.location?.latitude ?? null,
    longitude: result.location?.longitude ?? null,
    provider: "maxmind",
  };
}

export const getRequestContext = async (req: Request) => {
  const requestMetadata = getRequestMetadata(req);
  const { country, region, city } = getLocationFromIp(
    requestMetadata.ipAddress,
  );
  const location: LocationMetadata = { country, region, city };

  return {
    requestMetadata,
    location,
  };
};
