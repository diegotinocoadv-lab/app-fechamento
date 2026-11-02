/**
 * Serviço de e-mail usando Resend API.
 * Para ativar: configure RESEND_API_KEY e RESEND_FROM no .env da VPS.
 * Enquanto não configurado, os e-mails são silenciosamente ignorados.
 */

const RESEND_API_KEY = process.env["RESEND_API_KEY"] ?? "";
const RESEND_FROM = process.env["RESEND_FROM"] ?? "Fechamento <noreply@projetosdt.com.br>";

interface EmailOpcoes {
  para: string[];
  assunto: string;
  html: string;
}

/**
 * Envia um e-mail. Retorna { ok, erro }.
 * Se RESEND_API_KEY não estiver configurado, retorna { ok: true, ignorado: true }.
 */
export async function enviarEmail(opcoes: EmailOpcoes): Promise<{ ok: boolean; ignorado?: boolean; erro?: string }> {
  if (!RESEND_API_KEY) {
    return { ok: true, ignorado: true };
  }

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: opcoes.para,
        subject: opcoes.assunto,
        html: opcoes.html,
      }),
    });

    if (!resp.ok) {
      const body = await resp.text();
      return { ok: false, erro: `Resend API: ${resp.status} - ${body}` };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : String(err) };
  }
}

/** Gera o HTML do e-mail de fechamento. */
export function emailHtmlFechamento(opts: {
  data: string;
  funcionario: string;
  total: number;
  diferenca: number;
  relatorio: number;
  pdfUrl: string | null;
}): string {
  const dataBr = opts.data.split("-").reverse().join("/");
  const corDiferenca = Math.abs(opts.diferenca) < 0.005 ? "#1e1e1e" : opts.diferenca > 0 ? "#059669" : "#dc2626";
  const sinal = opts.diferenca > 0 ? "+" : "";

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f5f5f5;">
  <div style="max-width:600px;margin:20px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <div style="background:#1e3a5f;padding:20px 24px;">
      <h1 style="margin:0;color:#fff;font-size:20px;">Loterica Brasil da Sorte</h1>
      <p style="margin:4px 0 0;color:#d1d5db;font-size:14px;">Fechamento de Caixa</p>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 16px;color:#374151;font-size:14px;">
        Um fechamento de caixa foi registrado em <strong>${dataBr}</strong>.
      </p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
        <tr>
          <td style="padding:8px 0;color:#6b7280;font-size:13px;">Funcionário</td>
          <td style="padding:8px 0;color:#111827;font-size:13px;font-weight:600;text-align:right;">${opts.funcionario || "—"}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#6b7280;font-size:13px;border-top:1px solid #e5e7eb;">Relatório</td>
          <td style="padding:8px 0;color:#111827;font-size:13px;text-align:right;border-top:1px solid #e5e7eb;">R$ ${opts.relatorio.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#6b7280;font-size:13px;">Total</td>
          <td style="padding:8px 0;color:#111827;font-size:13px;font-weight:600;text-align:right;">R$ ${opts.total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#6b7280;font-size:13px;border-top:1px solid #e5e7eb;">Diferença</td>
          <td style="padding:8px 0;color:${corDiferenca};font-size:14px;font-weight:700;text-align:right;border-top:1px solid #e5e7eb;">${sinal}R$ ${Math.abs(opts.diferenca).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
        </tr>
      </table>
      ${opts.pdfUrl ? `
      <a href="${opts.pdfUrl}" style="display:inline-block;background:#1e3a5f;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:600;">Baixar PDF</a>
      ` : ""}
    </div>
    <div style="background:#f9fafb;padding:16px 24px;border-top:1px solid #e5e7eb;">
      <p style="margin:0;color:#9ca3af;font-size:11px;text-align:center;">
        Sistema de Fechamento de Caixa - Loterica Brasil da Sorte
      </p>
    </div>
  </div>
</body>
</html>`;
}
