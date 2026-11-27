// Read-only verification. Report only check names, never the API response or secrets.
const ref = process.env.SUPABASE_PROJECT_REF;
const token = process.env.SUPABASE_ACCESS_TOKEN;
const origin = process.env.YBRD_SITE_ORIGIN;
if (!ref || !/^[a-z0-9]{20}$/.test(ref) || !token || !origin) {
  console.error(
    "Supabase não verificado. Informe SUPABASE_PROJECT_REF, SUPABASE_ACCESS_TOKEN e YBRD_SITE_ORIGIN no ambiente seguro.",
  );
  process.exitCode = 2;
} else {
  try {
    if (new URL(origin).origin !== origin || !origin.startsWith("https://")) throw new Error();
    const get = async (path) => {
      const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/${path}`, {
        headers: { Authorization: `Bearer ${token}` },
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error();
      return res.json();
    };
    const [config, keys, legacy, migrations] = await Promise.all([
      get("config/auth"),
      get("api-keys?reveal=false"),
      get("api-keys/legacy"),
      get("database/migrations"),
    ]);
    const urls = String(config.uri_allow_list ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const required = [origin + "/entrar", origin + "/redefinir-senha"];
    const checks = [
      [
        "CAPTCHA nativo Turnstile",
        config.security_captcha_enabled === true &&
          config.security_captcha_provider === "turnstile",
      ],
      [
        "TOTP habilitado para cadastro e verificação",
        config.mfa_totp_enroll_enabled === true && config.mfa_totp_verify_enabled === true,
      ],
      ["Chaves legadas desativadas", legacy?.enabled === false],
      [
        "Gateway sem chaves publicáveis ativas",
        Array.isArray(keys) &&
          keys.some((key) => key?.type === "secret") &&
          keys.every((key) => key?.type === "secret" || key?.type === "legacy"),
      ],
      [
        "Migrações de segurança aplicadas",
        Array.isArray(migrations) &&
          ["20261110150000", "20261119010000", "20261126010000"].every((v) =>
            migrations.some((m) => m.version === v),
          ),
      ],
      ["Confirmação de e-mail", config.mailer_autoconfirm === false],
      ["IP encaminhado pelo servidor da loja", config.security_sb_forwarded_for_enabled === true],
      [
        "Prazo de autenticação por e-mail",
        config.mailer_otp_exp > 0 && config.mailer_otp_exp <= 1800,
      ],
      [
        "Cota de e-mails por hora",
        config.rate_limit_email_sent > 0 && config.rate_limit_email_sent <= 30,
      ],
      [
        "Cota de verificação de tokens",
        config.rate_limit_verify > 0 && config.rate_limit_verify <= 20,
      ],
      [
        "Remetente configurado",
        Boolean(config.smtp_host && config.smtp_admin_email) ||
          config.hook_send_email_enabled === true,
      ],
      [
        "Domínio e redirecionamentos exatos",
        config.site_url === origin &&
          required.every((u) => urls.includes(u)) &&
          urls.every((u) => required.includes(u) || u === origin),
      ],
    ];
    for (const [label, ok] of checks) console.log(`${ok ? "OK" : "PENDENTE"} — ${label}`);
    if (checks.some(([, ok]) => !ok)) process.exitCode = 1;
  } catch {
    console.error("Não foi possível verificar o projeto Supabase.");
    process.exitCode = 2;
  }
}
