import { Link } from "@tanstack/react-router";
import { AppNav } from "@/components/AppNav";
import { ArrowLeft } from "lucide-react";

export function FiadoLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-background px-4 pb-6 pt-4">
      <div className="mx-auto max-w-5xl space-y-4">
        <AppNav />
        <header className="space-y-1">
          <Link
            to="/fiado-dashboard"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle && (
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          )}
        </header>
        {children}
      </div>
    </main>
  );
}
