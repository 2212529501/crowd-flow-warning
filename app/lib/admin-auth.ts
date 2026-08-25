import { createHmac, timingSafeEqual } from "crypto";

export const ADMIN_SESSION_COOKIE = "crowd_flow_admin_session";
const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

function getManagementPassword() {
  return process.env.MANAGEMENT_PASSWORD ?? "";
}

function signTimestamp(timestamp: string) {
  return createHmac("sha256", getManagementPassword())
    .update(timestamp)
    .digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function isManagementPasswordConfigured() {
  return Boolean(getManagementPassword());
}

export function verifyManagementPassword(password: unknown) {
  const configuredPassword = getManagementPassword();

  if (
    !configuredPassword ||
    typeof password !== "string" ||
    password.length !== configuredPassword.length
  ) {
    return false;
  }

  return safeEqual(password, configuredPassword);
}

export function createAdminSession() {
  const timestamp = String(Date.now());
  return `${timestamp}.${signTimestamp(timestamp)}`;
}

export function isValidAdminSession(value: string | undefined) {
  if (!value || !getManagementPassword()) {
    return false;
  }

  const [timestamp, signature] = value.split(".");
  const timestampNumber = Number(timestamp);

  if (
    !timestamp ||
    !signature ||
    !Number.isFinite(timestampNumber) ||
    Date.now() - timestampNumber > SESSION_MAX_AGE_SECONDS * 1000 ||
    timestampNumber > Date.now() + 60_000
  ) {
    return false;
  }

  return safeEqual(signature, signTimestamp(timestamp));
}

function readCookie(request: Request, name: string) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));

  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : undefined;
}

export function isAdminRequest(request: Request) {
  return isValidAdminSession(readCookie(request, ADMIN_SESSION_COOKIE));
}

export const adminSessionMaxAge = SESSION_MAX_AGE_SECONDS;
