import jwt from "jsonwebtoken";
import { getApiConfig } from "./config.mjs";

const { jwtSecret } = getApiConfig();

export function signAccessToken(payload) {
  return jwt.sign(payload, jwtSecret, {
    expiresIn: "8h",
    issuer: "wfh-pulse-api",
    audience: "wfh-pulse-client",
  });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, jwtSecret, {
    issuer: "wfh-pulse-api",
    audience: "wfh-pulse-client",
  });
}

