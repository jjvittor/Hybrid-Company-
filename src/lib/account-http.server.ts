import { createClient, type Session, type SupabaseClient, type User } from "@supabase/supabase-js";
import { z } from "zod";
import {
  actions,
  genericEmailMessage,
  invalidLoginMessage,
  passwordIssue,
  retryMessage,
  type AccountAction,
} from "./account-schema";

const invalidLink = "Este link é inválido ou expirou. Solicite um novo link.";
const unavailable = "Não foi possível concluir. Tente novamente.";
const disposable = new Set([
  "mailinator.com",
  "10minutemail.com",
  "guerrillamail.com",
  "tempmail.com",
  "yopmail.com",
  "trashmail.com",
  "dispostable.com",
]);
const encoder = new TextEncoder();
const purposeName = { login: "account", recovery: "recovery" } as const;
type Purpose = keyof typeof purposeName;
const noStore = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

class AccountError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly captcha = false,
  ) {
    super(message);
  }
}

function config() {
  const origin = process.env["YBRD_SITE_ORIGIN"];
  const url = process.env["SUPABASE_URL"];
  const key = process.env["YBRD_SUPABASE_SECRET_KEY"];
  const pepper = process.env["YBRD_SECURITY_PEPPER"];
  const ipHeader = process.env["YBRD_TRUSTED_IP_HEADER"] ?? "cf-connecting-ip";
  if (
    !origin ||
    new URL(origin).origin !== origin ||
    !url ||
    !key?.startsWith("sb_secret_") ||
    !pepper ||
    pepper.length < 32 ||
    process.env["YBRD_AUTH_GATEWAY_LOCKED"] !== "true"
  ) {
    throw new AccountError(503, unavailable);
  }
  if (!origin.startsWith("https://") && new URL(origin).hostname !== "localhost") {
    throw new AccountError(503, unavailable);
  }
  return { origin, url, key, pepper, ipHeader };
}

function backend(settings: ReturnType<typeof config>, jwt?: string) {
  return createClient(settings.url, settings.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    ...(jwt ? { accessToken: async () => jwt } : {}),
    global: {
      fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(8000) }),
    },
  });
}

async function body(request: Request) {
  const type = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (type !== "application/json") throw new AccountError(415, unavailable);
  const max = 8192;
  if (Number(request.headers.get("content-length")) > max) throw new AccountError(413, unavailable);
  const reader = request.body?.getReader();
  if (!reader) throw new AccountError(400, unavailable);
  const bytes = new Uint8Array(max);
  let length = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      if (length + next.value.length > max) {
        void reader.cancel();
        throw new AccountError(413, unavailable);
      }
      bytes.set(next.value, length);
      length += next.value.length;
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, length)));
  } catch (error) {
    if (error instanceof AccountError) throw error;
    throw new AccountError(400, unavailable);
  } finally {
    reader.releaseLock();
  }
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
async function hash(pepper: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))));
}

async function checkCaptcha(request: Request, ip: string, token?: string) {
  const secret = process.env["YBRD_TURNSTILE_SECRET"];
  if (!secret) throw new AccountError(503, "A verificação de segurança está indisponível.");
  if (!token) throw new AccountError(403, "Conclua a verificação de segurança.", true);
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: new URLSearchParams({ secret, response: token, remoteip: ip }),
    signal: AbortSignal.timeout(5000),
  });
  const data = await response.json();
  if (
    !response.ok ||
    data.success !== true ||
    data.hostname !== new URL(request.url).hostname ||
    data.action !== "ybrd-account"
  ) {
    throw new AccountError(403, "Conclua a verificação de segurança.", true);
  }
}

function cookieName(purpose: Purpose, type: "at" | "rt") {
  return `__Host-ybrd-${purposeName[purpose]}-${type}`;
}

function writeCookies(headers: Headers, purpose: Purpose, session?: Session) {
  const maxAge = !session ? 0 : purpose === "recovery" ? 600 : 43200;
  for (const type of ["at", "rt"] as const) {
    const value = (type === "at" ? session?.access_token : session?.refresh_token) ?? "";
    headers.append(
      "Set-Cookie",
      `${cookieName(purpose, type)}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; Secure; HttpOnly; SameSite=Strict`,
    );
  }
}

function readCookie(request: Request, name: string) {
  const match = request.headers
    .get("cookie")
    ?.split(/;\s*/)
    .find((pair) => pair.startsWith(name + "="));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : "";
}

const validClaims = z.object({
  session_id: z.string().uuid(),
  sub: z.string().uuid(),
  aal: z.enum(["aal1", "aal2"]),
});
async function sessionClaims(client: SupabaseClient, session: Session) {
  const { data, error } = await client.auth.getClaims(session.access_token);
  const result = validClaims.safeParse(data?.claims);
  if (error || !result.success || result.data.sub !== session.user.id)
    throw new AccountError(401, unavailable);
  return result.data;
}

async function rpc(client: SupabaseClient, name: string, args: Record<string, unknown>) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error("account rpc failed");
  return data;
}

async function audit(client: SupabaseClient, type: string, ipHash: string, user?: string) {
  const { error } = await client
    .from("security_events")
    .insert({ tipo: type, ip_hash: ipHash, user_id: user ?? null });
  if (error) console.error("[YBRD] Falha ao registrar evento de segurança.");
}

export async function handleAccount(request: Request, action: string) {
  const headers = new Headers(noStore);
  const reply = (data: object, status = 200) => Response.json(data, { status, headers });
  try {
    if (!Object.hasOwn(actions, action)) return reply({ message: unavailable }, 404);
    if (request.method !== "POST") {
      headers.set("Allow", "POST");
      return reply({ message: unavailable }, 405);
    }
    if (action === "status" && !readCookie(request, cookieName("login", "rt"))) {
      const origin = request.headers.get("origin");
      if (
        origin !== new URL(request.url).origin ||
        request.headers.get("sec-fetch-site") === "cross-site"
      )
        return reply({ message: unavailable }, 403);
      if (!actions.status.safeParse(await body(request)).success)
        return reply({ message: unavailable }, 400);
      return reply({ user: null });
    }
    const settings = config();
    if (
      request.headers.get("origin") !== settings.origin ||
      new URL(request.url).origin !== settings.origin ||
      request.headers.get("sec-fetch-site") === "cross-site"
    ) {
      return reply({ message: unavailable }, 403);
    }
    const trustedIp = z
      .union([z.ipv4(), z.ipv6()])
      .safeParse(request.headers.get(settings.ipHeader));
    if (!trustedIp.success) return reply({ message: unavailable }, 503);
    const ip = trustedIp.data;
    const ipHash = await hash(settings.pepper, `ip:${ip}`);
    const input: unknown = await body(request);
    const operation = action as AccountAction;
    const validation = actions[operation].safeParse(input);
    if (!validation.success) {
      const invalidPublicInput =
        operation === "login" ? invalidLoginMessage : "Verifique os dados informados.";
      return reply({ message: invalidPublicInput }, 400);
    }
    const admin = backend(settings);

    const rate = async (
      bucket: string,
      subject: string,
      ipLimit: number,
      subjectLimit: number,
      login = false,
      userId?: string,
    ) => {
      const subjectKey = `${bucket}:subject:${await hash(settings.pepper, subject)}`;
      const result = await rpc(admin, "ybrd_attempt", {
        p_ip: `${bucket}:ip:${ipHash}`,
        p_subject: subjectKey,
        p_ip_limit: ipLimit,
        p_subject_limit: subjectLimit,
        p_login: login,
      });
      if (result?.blocked) await audit(admin, "bloqueio_tentativas", ipHash, userId);
      if (!result?.allowed) {
        headers.set("Retry-After", "900");
        throw new AccountError(429, retryMessage);
      }
      return { subjectKey, count: Number(result.count), captcha: result.captcha === true };
    };

    const register = async (session: Session, purpose: Purpose) => {
      if (!session.user.email_confirmed_at) throw new AccountError(401, invalidLoginMessage);
      const claims = await sessionClaims(admin, session);
      await rpc(admin, "ybrd_register_session", {
        p_id: claims.session_id,
        p_user: claims.sub,
        p_purpose: purpose,
      });
      const access = await rpc(admin, "ybrd_session_access", {
        p_id: claims.session_id,
        p_user: claims.sub,
        p_purpose: purpose,
      });
      if (!access) throw new AccountError(401, unavailable);
      writeCookies(headers, purpose, session);
      return access === "mfa";
    };

    const authenticate = async (purpose: Purpose) => {
      const at = readCookie(request, cookieName(purpose, "at"));
      const rt = readCookie(request, cookieName(purpose, "rt"));
      if (!at || !rt) throw new AccountError(401, unavailable);
      const client = backend(settings);
      const { data, error } = await client.auth.setSession({ access_token: at, refresh_token: rt });
      if (error || !data.session || !data.user?.email_confirmed_at)
        throw new AccountError(401, unavailable);
      const session = data.session;
      const claims = await sessionClaims(client, session);
      const access = await rpc(admin, "ybrd_session_access", {
        p_id: claims.session_id,
        p_user: claims.sub,
        p_purpose: purpose,
      });
      if (!access) throw new AccountError(401, unavailable);
      if (session.access_token !== at) writeCookies(headers, purpose, session);
      return {
        client,
        session,
        claims,
        user: data.user,
        needsMfa: access === "mfa" && claims.aal !== "aal2",
        hasMfa: access === "mfa",
      };
    };

    if (
      operation === "login" ||
      operation === "signup" ||
      operation === "recover" ||
      operation === "resend"
    ) {
      const auth = actions[operation].parse(input);
      if (auth.website) {
        if (operation === "login") return reply({ message: invalidLoginMessage }, 401);
        await delay(1000);
        return reply({ message: genericEmailMessage });
      }
      const attempt = await rate("email", auth.email, 20, 5, operation === "login");
      await delay(Math.min(2000, (attempt.count - 1) * 350));
      if (operation !== "login" || attempt.captcha) await checkCaptcha(request, ip, auth.captcha);

      if (operation === "login") {
        const { password, email, next } = actions.login.parse(input);
        const { data, error } = await admin.auth.signInWithPassword({ email, password });
        const success = !error && !!data.session && !!data.user?.email_confirmed_at;
        const failures = await rpc(admin, "ybrd_login_result", {
          p_subject: attempt.subjectKey,
          p_success: success,
        });
        if (!success || !data.session) {
          const subject = await rpc(admin, "ybrd_audit_subject", { p_email: email });
          await audit(admin, "login_falho", ipHash, subject ?? undefined);
          if (failures === 3) await audit(admin, "alerta_falhas", ipHash, subject ?? undefined);
          return reply({ message: invalidLoginMessage }, 401);
        }
        const needsMfa = await register(data.session, "login");
        if (!needsMfa) await audit(admin, "login_ok", ipHash, data.user.id);
        return reply({ needsMfa, next });
      }

      // Keep provider errors and account existence out of the response and its normal timing.
      const start = Date.now();
      try {
        if (operation === "signup" && !disposable.has(auth.email.split("@")[1] ?? "")) {
          const { email, nome, password } = actions.signup.parse(input);
          const { data } = await admin.auth.signUp({
            email,
            password,
            options: { data: { nome }, emailRedirectTo: settings.origin + "/entrar" },
          });
          if (data.session) {
            await admin.auth.admin.signOut(data.session.access_token, "local");
            console.error("[YBRD] Confirmação de e-mail obrigatória deve ser ativada.");
          }
        }
        if (operation === "resend")
          await admin.auth.resend({
            type: "signup",
            email: auth.email,
            options: { emailRedirectTo: settings.origin + "/entrar" },
          });
        if (operation === "recover")
          await admin.auth.resetPasswordForEmail(auth.email, {
            redirectTo: settings.origin + "/redefinir-senha",
          });
      } catch {
        console.error("[YBRD] Falha de transporte do serviço de e-mail.");
      }
      await delay(
        Math.max(
          0,
          1350 + (crypto.getRandomValues(new Uint8Array(1))[0] ?? 0) - (Date.now() - start),
        ),
      );
      return reply({ message: genericEmailMessage });
    }

    if (operation === "verify") {
      const { token, type } = actions.verify.parse(input);
      await rate("verify", ipHash, 20, 20);
      const { data, error } = await admin.auth.verifyOtp({ type, token_hash: token });
      if (error) return reply({ message: invalidLink }, 400);
      if (type === "recovery") {
        if (!data.session) return reply({ message: invalidLink }, 400);
        const needsMfa = await register(data.session, "recovery");
        return reply({ needsMfa });
      }
      if (data.session) await admin.auth.admin.signOut(data.session.access_token, "local");
      return reply({
        message:
          type === "signup"
            ? "E-mail confirmado. Você já pode entrar."
            : "Confirmação recebida. Entre após confirmar nos dois endereços.",
      });
    }

    const purpose: Purpose =
      operation === "reset" ||
      operation === "recovery-status" ||
      (operation === "mfa-verify" && actions["mfa-verify"].parse(input).recovery)
        ? "recovery"
        : "login";
    if (!readCookie(request, cookieName(purpose, "rt"))) {
      if (operation === "status") return reply({ user: null });
      throw new AccountError(401, purpose === "recovery" ? invalidLink : unavailable);
    }

    // Limit even invalid/expired cookies before making upstream authentication requests.
    await rate("session", ipHash, 120, 120);
    let auth: Awaited<ReturnType<typeof authenticate>>;
    try {
      auth = await authenticate(purpose);
    } catch (error) {
      if (error instanceof AccountError && error.status === 401) {
        writeCookies(headers, purpose);
        if (operation === "status") return reply({ user: null });
      }
      throw error;
    }
    const { client, session, claims, user, needsMfa, hasMfa } = auth;
    const { id } = user;
    const factors = () =>
      client.auth.mfa.listFactors().then((result) => {
        if (result.error) throw new AccountError(400, unavailable);
        return result.data.all.filter((factor) => factor.factor_type === "totp");
      });

    if (operation === "status") {
      return reply(
        needsMfa
          ? {
              user: null,
              factors: (await factors())
                .filter((factor) => factor.status === "verified")
                .map(({ id }) => id),
            }
          : { user: { email: user.email } },
      );
    }
    if (operation === "recovery-status") {
      return reply({
        factors: needsMfa
          ? (await factors()).filter((factor) => factor.status === "verified").map(({ id }) => id)
          : [],
      });
    }
    if (operation === "logout") {
      const { all } = actions.logout.parse(input);
      if (needsMfa && all) throw new AccountError(403, unavailable);
      const { error } = await client.auth.signOut({ scope: all ? "global" : "local" });
      if (error && !all) throw new AccountError(400, unavailable);
      if (all) await rpc(admin, "ybrd_revoke_sessions", { p_user: id });
      writeCookies(headers, "login");
      writeCookies(headers, "recovery");
      return reply({});
    }

    if (operation !== "profile") {
      const sensitive = [
        "mfa-verify",
        "mfa-recover",
        "mfa-codes",
        "mfa-remove",
        "mfa-enroll",
        "change-password",
        "change-email",
        "delete",
        "reset",
      ].includes(operation);
      const attempt = await rate(
        sensitive ? "sensitive" : "profile",
        id,
        sensitive ? 20 : 60,
        sensitive ? 5 : 30,
        false,
        id,
      );
      if (sensitive) await delay((attempt.count - 1) * 350);
    }

    if (operation === "mfa-verify") {
      const { id: factorId, code } = actions["mfa-verify"].parse(input);
      const factor = (await factors()).find((item) => item.id === factorId);
      if (!factor || (needsMfa && factor.status !== "verified"))
        throw new AccountError(400, unavailable);
      const result = await client.auth.mfa.challengeAndVerify({ factorId, code });
      if (result.error) throw new AccountError(400, "Código inválido ou expirado.");
      const fresh = await client.auth.getSession();
      if (
        !fresh.data.session ||
        (await sessionClaims(client, fresh.data.session)).session_id !== claims.session_id
      ) {
        throw new AccountError(401, unavailable);
      }
      writeCookies(headers, purpose, fresh.data.session);
      if (purpose === "login" && needsMfa) await audit(admin, "login_ok", ipHash, id);
      return reply({});
    }

    if (operation === "mfa-recover" && needsMfa && purpose === "login") {
      const { code } = actions["mfa-recover"].parse(input);
      const used = await rpc(admin, "ybrd_use_recovery_code", {
        p_user: id,
        p_hash: await hash(settings.pepper, `recovery:${id}:${code.toLowerCase()}`),
      });
      if (!used) throw new AccountError(400, "Código inválido ou expirado.");
      writeCookies(headers, "login");
      writeCookies(headers, "recovery");
      await audit(admin, "recuperacao_2fa", ipHash, id);
      return reply({});
    }

    if (needsMfa) throw new AccountError(403, "Confirme a verificação em duas etapas.");
    const reauthenticate = async (current: string) => {
      if (!user.email) throw new AccountError(403, unavailable);
      const fresh = backend(settings);
      const { data, error } = await fresh.auth.signInWithPassword({
        email: user.email,
        password: current,
      });
      if (error || data.user?.id !== id || !data.session)
        throw new AccountError(403, invalidLoginMessage);
      const revoked = await fresh.auth.admin.signOut(data.session.access_token, "local");
      if (revoked.error) throw new AccountError(400, unavailable);
    };

    if (operation === "profile" || operation === "save-profile") {
      // The user JWT goes to PostgREST so RLS applies in addition to the ownership check here.
      const db = backend(settings, session.access_token);
      const query =
        operation === "profile"
          ? db.from("profiles").select("nome, telefone").eq("id", id)
          : db
              .from("profiles")
              .update(actions["save-profile"].parse(input))
              .eq("id", id)
              .select("nome, telefone");
      const { data, error } = await query.single();
      if (error) throw new AccountError(400, unavailable);
      return reply({
        profile: data,
        factors: (await factors())
          .filter((factor) => factor.status === "verified")
          .map(({ id }) => id),
      });
    }

    if (operation === "reset" || operation === "change-password") {
      const { password, confirmation } = actions.reset.passthrough().parse(input);
      if (password !== confirmation) throw new AccountError(400, "As senhas não são iguais.");
      const { data: profile, error: profileError } = await admin
        .from("profiles")
        .select("nome")
        .eq("id", id)
        .single();
      if (profileError) throw new AccountError(400, unavailable);
      const issue = passwordIssue(password, user.email ?? "", profile.nome);
      if (issue) throw new AccountError(400, issue);
      if (operation === "change-password") {
        await reauthenticate(actions["change-password"].parse(input).current);
      } else {
        const claimed = await rpc(admin, "ybrd_claim_recovery", {
          p_id: claims.session_id,
          p_user: id,
        });
        if (!claimed) throw new AccountError(400, invalidLink);
        writeCookies(headers, "recovery");
      }
      const { error } = await client.auth.updateUser({ password });
      if (error)
        throw new AccountError(
          400,
          operation === "reset"
            ? "Não foi possível usar essa senha. Solicite um novo link."
            : "Não foi possível usar essa senha.",
        );
      const revoked = await client.auth.signOut({ scope: "global" });
      writeCookies(headers, "login");
      writeCookies(headers, "recovery");
      if (revoked.error) console.error("[YBRD] A revogação nativa da sessão falhou.");
      await rpc(admin, "ybrd_revoke_sessions", { p_user: id });
      return reply({});
    }

    if (operation === "change-email") {
      const { current, email } = actions["change-email"].parse(input);
      await reauthenticate(current);
      if (!disposable.has(email.split("@")[1] ?? "")) {
        await client.auth.updateUser({ email }, { emailRedirectTo: settings.origin + "/entrar" });
      }
      return reply({ message: "Se a alteração puder ser feita, confirme nos dois endereços." });
    }

    if (operation === "delete") {
      await reauthenticate(actions.delete.parse(input).current);
      const { error } = await admin.auth.admin.deleteUser(id, false);
      if (error) throw new AccountError(400, unavailable);
      writeCookies(headers, "login");
      writeCookies(headers, "recovery");
      return reply({});
    }

    if (operation === "mfa-enroll") {
      await reauthenticate(actions["mfa-enroll"].parse(input).current);
      for (const factor of await factors()) {
        if (factor.status === "unverified") {
          const { error } = await client.auth.mfa.unenroll({ factorId: factor.id });
          if (error) throw new AccountError(400, unavailable);
        }
      }
      const { data, error } = await client.auth.mfa.enroll({ factorType: "totp", issuer: "Ybrd" });
      if (error) throw new AccountError(400, unavailable);
      // Display the setup key as text. No generated images or injected markup.
      return reply({ id: data.id, secret: data.totp.secret });
    }

    if (operation === "mfa-codes") {
      await reauthenticate(actions["mfa-codes"].parse(input).current);
      if (!hasMfa || claims.aal !== "aal2") throw new AccountError(403, unavailable);
      const codes = Array.from({ length: 8 }, () =>
        hex(crypto.getRandomValues(new Uint8Array(16))),
      );
      const hashes = await Promise.all(
        codes.map((code) => hash(settings.pepper, `recovery:${id}:${code}`)),
      );
      await rpc(admin, "ybrd_replace_recovery_codes", { p_user: id, p_hashes: hashes });
      return reply({ codes });
    }

    if (operation === "mfa-remove") {
      const { id: factorId, current } = actions["mfa-remove"].parse(input);
      await reauthenticate(current);
      if (!hasMfa || claims.aal !== "aal2") throw new AccountError(403, unavailable);
      if (
        !(await factors()).some((factor) => factor.id === factorId && factor.status === "verified")
      )
        throw new AccountError(400, unavailable);
      const removed = await rpc(admin, "ybrd_remove_factor", { p_user: id, p_factor: factorId });
      if (!removed) throw new AccountError(400, unavailable);
      writeCookies(headers, "login");
      writeCookies(headers, "recovery");
      return reply({});
    }

    return reply({ message: unavailable }, 400);
  } catch (error) {
    if (error instanceof AccountError) {
      return reply(
        { message: error.message, ...(error.captcha ? { captcha: true } : {}) },
        error.status,
      );
    }
    console.error("[YBRD] Falha interna no serviço de conta.");
    return reply({ message: unavailable }, 503);
  }
}

/** Uses the same signed token and revocation record as the account gateway. */
export async function commerceAccount(request: Request) {
  const token = readCookie(request, cookieName("login", "at"));
  if (!token) return null;
  const settings = config();
  const admin = backend(settings);
  const { data, error } = await admin.auth.getClaims(token);
  const claims = validClaims.safeParse(data?.claims);
  if (error || !claims.success) throw new AccountError(401, "Entre novamente na sua conta.");
  const { sub, session_id: sessionId, aal } = claims.data;
  const access = await rpc(admin, "ybrd_session_access", {
    p_id: sessionId,
    p_user: sub,
    p_purpose: "account",
  });
  if (!access || (access === "mfa" && aal !== "aal2"))
    throw new AccountError(401, "Entre novamente na sua conta.");
  return { id: sub, client: backend(settings, token) };
}
