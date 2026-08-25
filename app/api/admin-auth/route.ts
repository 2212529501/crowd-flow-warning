import { NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  adminSessionMaxAge,
  createAdminSession,
  isAdminRequest,
  isManagementPasswordConfigured,
  verifyManagementPassword
} from "../../lib/admin-auth";

export const runtime = "nodejs";

type AuthRequest = {
  password?: unknown;
};

export async function GET(request: Request) {
  return NextResponse.json({ authenticated: isAdminRequest(request) });
}

export async function POST(request: Request) {
  if (!isManagementPasswordConfigured()) {
    return NextResponse.json(
      { error: "管理密码尚未配置，请联系管理员" },
      { status: 503 }
    );
  }

  let payload: AuthRequest;

  try {
    payload = (await request.json()) as AuthRequest;
  } catch {
    return NextResponse.json({ error: "请输入管理密码" }, { status: 400 });
  }

  if (!verifyManagementPassword(payload.password)) {
    return NextResponse.json({ error: "管理密码错误" }, { status: 401 });
  }

  const response = NextResponse.json({ authenticated: true });
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: createAdminSession(),
    httpOnly: true,
    maxAge: adminSessionMaxAge,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ authenticated: false });
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: "",
    maxAge: 0,
    path: "/"
  });
  return response;
}
