import z from "zod";
import {
  LocationMetadata,
  RequestMetadata,
} from "../../repositories/repository-types.js";
import { loginSchema } from "./auth.validators.js";

export type LoginInput = {
  email: string;
  password: string;
  requestMetadata: RequestMetadata;
  location: LocationMetadata;
};

export type LoginBody = z.infer<typeof loginSchema>["body"];
