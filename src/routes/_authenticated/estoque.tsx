import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Rota mantida apenas por compatibilidade.
 *
 * A tela de estoque foi mesclada em "Bolões" (`controle-boloes.tsx`), que já
 * concentra criação, venda, encerramento, finalização e relatório. Quem abrir
 * `/estoque` (link antigo ou favorito) é levado para lá com os filtros padrão.
 */
export const Route = createFileRoute("/_authenticated/estoque")({
  beforeLoad: () => {
    throw redirect({
      to: "/controle-boloes",
      search: { de: "", ate: "", modalidade: "", situacao: "ativo" },
    });
  },
  head: () => ({
    meta: [
      { title: "Estoque de bolões | Lotérica Brasil da Sorte" },
      {
        name: "description",
        content: "A tela de estoque foi incorporada à página de Bolões.",
      },
      { property: "og:title", content: "Estoque de bolões | Brasil da Sorte" },
      {
        property: "og:description",
        content: "Controle de estoque e vendas de cotas de bolões.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});
