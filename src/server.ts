import "./lib/error-capture";

import { iniciarAutoEncerrar } from "./lib/auto-encerrar.server";
import { iniciarSyncRadarlot } from "./lib/radarlot-sync.server";
import { consumeLastCapturedError, describeError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

// Encerra sozinho, no servidor, os lotes de estoque com sorteio já passado.
iniciarAutoEncerrar();
// Importa bolões do RadarLot para o estoque, para os operadores lançarem.
iniciarSyncRadarlot();

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(
  request: Request,
  response: Response,
): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  const capturado = consumeLastCapturedError();
  const detalhes =
    capturado !== undefined ? describeError(capturado) : `h3 swallowed SSR error: ${body}`;
  console.error(capturado instanceof Error ? capturado : new Error(detalhes));
  return new Response(renderErrorPage(`${detalhes}\nURL: ${request.url}`), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(request, response);
    } catch (error) {
      // Requisição cancelada pelo navegador (recarregar/sair): ignorar silenciosamente.
      if (
        request.signal.aborted ||
        (error != null &&
          typeof error === "object" &&
          ((error as { name?: string }).name === "AbortError" ||
            (error as { code?: string }).code === "ABORT_ERR"))
      ) {
        return new Response(null, { status: 499 });
      }
      console.error(error);
      return new Response(renderErrorPage(`${describeError(error)}\nURL: ${request.url}`), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
