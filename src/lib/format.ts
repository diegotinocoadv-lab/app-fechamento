export { brl } from "@/lib/fechamento-campos";

export const fmtDate = (d: string | Date | null | undefined) => {
  if (!d) return "-";
  const dt = typeof d === "string" ? new Date(d.includes("T") ? d : d + "T00:00:00") : d;
  return dt.toLocaleDateString("pt-BR");
};

export const fmtDateTime = (d: string | Date | null | undefined) => {
  if (!d) return "-";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};

export const isVencido = (data_vencimento: string | null | undefined, status: string) => {
  if (status === "vencido") return true;
  if (status !== "pendente" || !data_vencimento) return false;
  return new Date(data_vencimento + "T23:59:59") < new Date();
};
