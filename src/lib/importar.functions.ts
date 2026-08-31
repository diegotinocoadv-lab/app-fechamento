import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const entrada = z.object({
  mimeType: z.string().min(3).max(80),
  imageBase64: z.string().min(50).max(8_000_000),
});

/**
 * Lê uma foto/print de fechamento de caixa e devolve os campos extraídos
 * para revisão antes de aplicar no formulário.
 */
export const extrairFechamentoDaImagem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => entrada.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("IA indisponível: chave não configurada.");

    const instrucoes = [
      "Você lê fotos e prints de planilhas de fechamento de caixa de lotérica (português do Brasil).",
      "Extraia os valores exatamente como aparecem, sem inventar dados.",
      "Responda SOMENTE com JSON válido no formato:",
      `{"data":"AAAA-MM-DD","funcionario":"","relatorio":"","valores":{"deposito1":"","deposito2":"","cartao":"","moedas":"","premioRasp":"","premioTS":"","pix":"","fiado":"","dinheiro":"","loja":""},`,
      `"saldoInicial":{"cedulas":"","moedas":"","rasp250":"","rasp500":"","rasp1000":"","telesena":"","tag":"","carneBau":"","chipCorreio":""},`,
      `"saldoFinal":{"cedulas":"","moedas":"","rasp250":"","rasp500":"","rasp1000":"","telesena":"","tag":"","carneBau":"","chipCorreio":""},`,
      `"boloes":[{"concurso":"","valor":"","taxa":"","quant":""}]}`,
      "Use números com ponto decimal (ex: 1250.50) e string vazia quando o campo não aparecer na imagem.",
    ].join(" ");

    const resposta = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3.7-flash",
        messages: [
          { role: "system", content: instrucoes },
          {
            role: "user",
            content: [
              { type: "text", text: "Extraia o fechamento, os saldos e os bolões desta imagem." },
              {
                type: "image_url",
                image_url: { url: `data:${data.mimeType};base64,${data.imageBase64}` },
              },
            ],
          },
        ],
      }),
    });

    if (!resposta.ok) {
      const corpo = await resposta.text();
      if (resposta.status === 429) throw new Error("Muitas requisições de IA. Tente em alguns segundos.");
      if (resposta.status === 402) throw new Error("Créditos de IA esgotados no workspace.");
      console.error("[IA] falha", resposta.status, corpo);
      throw new Error("Não foi possível ler a imagem agora.");
    }

    const json = (await resposta.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const texto = json.choices?.[0]?.message?.content ?? "";
    const bruto = texto.replace(/```json|```/g, "").trim();
    const inicio = bruto.indexOf("{");
    const fim = bruto.lastIndexOf("}");
    if (inicio < 0 || fim <= inicio) throw new Error("A IA não retornou dados legíveis da imagem.");

    let extraido: unknown;
    try {
      extraido = JSON.parse(bruto.slice(inicio, fim + 1));
    } catch {
      throw new Error("A IA não retornou dados legíveis da imagem.");
    }

    return { json: JSON.stringify(extraido) };
  });
