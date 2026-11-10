import type { z } from "zod";
import { actions, type AccountAction } from "./account-schema";

export class AccountRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly captcha: boolean,
  ) {
    super(message);
  }
}

export async function accountRequest<T, A extends AccountAction = AccountAction>(
  action: A,
  input?: z.input<(typeof actions)[A]>,
): Promise<T> {
  const send = async () => {
    const response = await fetch(`/api/conta/${action}`, {
      method: "POST",
      mode: "same-origin",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input ?? {}),
      signal: AbortSignal.timeout(20000),
    });
    const data = await response.json();
    if (!response.ok)
      throw new AccountRequestError(data.message, response.status, data.captcha === true);
    return data as T;
  };
  // Serialize refresh-capable calls across tabs when the browser supports Web Locks.
  return navigator.locks ? navigator.locks.request("ybrd-account-session", send) : send();
}

export type AccountStatus = { user: { email?: string } | null; factors?: string[] };
export type AccountProfile = {
  profile: { nome: string; telefone: string | null };
  factors: string[];
};
