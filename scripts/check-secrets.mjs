import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = realpathSync(fileURLToPath(new URL("..", import.meta.url)));
const ci = process.env.GITHUB_ACTIONS === "true";
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

async function check() {
  const found = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: root, encoding: "utf8" });
  if (found.status !== 0 || realpathSync(found.stdout.trim()) !== root) {
    if (ci || process.argv.includes("--history")) throw Error("A varredura requer um checkout Git.");
    return; // Source ZIPs can still run local application tests.
  }
  const tracked = git("ls-files", "-z").split("\0");
  if (tracked.some((p) => /(^|\/)(\.env(?:\..*)?|\.dev\.vars(?:\..*)?)$/.test(p) && !/(^|\/)\.env\.example$/.test(p)))
    throw Error("Arquivo de ambiente no índice do Git. Versione apenas o modelo .env.example.");
  if (!ci && !process.argv.includes("--history")) return;
  const opts = ["git", "--redact=100", "--no-banner", "--log-level=error", "--log-opts=--all", "."];
  if (!ci) {
    execFileSync("gitleaks", opts, { cwd: root, stdio: "inherit" });
    return;
  }
  // The public repository's existing CI checkout is shallow.
  const args = ["fetch", "--quiet", "--tags"];
  if (git("rev-parse", "--is-shallow-repository") === "true") args.push("--unshallow");
  git(...args, "origin", "+refs/heads/*:refs/remotes/origin/*");
  const dir = mkdtempSync(join(tmpdir(), "ybrd-gitleaks-"));
  try {
    const asset = "https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_linux_x64.tar.gz";
    const response = await fetch(asset, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw Error("Falha ao obter a ferramenta de varredura.");
    const bytes = Buffer.from(await response.arrayBuffer());
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== "551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb")
      throw Error("Arquivo de varredura com assinatura de conteúdo divergente.");
    const archive = join(dir, "scanner.tar.gz");
    writeFileSync(archive, bytes, { mode: 0o600 });
    execFileSync("tar", ["-xzf", archive, "-C", dir, "gitleaks"]);
    const report = join(dir, "relatorio.json");
    const scan = spawnSync(join(dir, "gitleaks"), [...opts, "--report-format=json", "--report-path", report], { cwd: root, stdio: "inherit" });
    if (scan.status !== 0) {
      if (existsSync(report)) {
        const findings = JSON.parse(readFileSync(report, "utf8"));
        for (const entry of findings) {
          console.error("Revisar", entry.RuleID, JSON.stringify(entry.File), entry.StartLine, String(entry.Commit).slice(0,12));
        }
      }
      throw Error("O verificador encontrou pendências no histórico ou falhou.");
    }
    console.log("Varredura de segredos do histórico concluída.");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
try {
  await check();
} catch (e) {
  console.error(e?.status ? "Varredura de segredos reprovada." : e.message);
  process.exitCode = 1;
}
