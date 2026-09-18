import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LikelihoodMeter } from "@/components/detection/likelihood-meter";
import { SegmentView } from "@/components/detection/segment-view";
import { SignalList } from "@/components/detection/signal-list";
import { DetectionDisclaimer } from "@/components/detection/detection-disclaimer";
import { DeleteScanButton } from "@/components/detection/delete-scan-button";
import { requireUser } from "@/lib/auth/session";
import { getScan } from "@/lib/detection/queries";
import { CONFIDENCE_COPY } from "@/lib/detection/scoring";
import { routes } from "@/lib/config/routes";
import { formatDate, formatNumber } from "@/lib/utils/format";
import type { WritingSignal } from "@/lib/detection/signals";

export const metadata: Metadata = {
  title: "Scan result",
  robots: { index: false, follow: false },
};

const SOURCE_LABELS: Record<string, string> = {
  text: "Pasted text",
  pdf: "PDF upload",
  docx: "Word document",
  txt: "Text file",
};

/** The stored signals are jsonb; read them defensively. */
function readSignals(value: unknown): WritingSignal[] {
  if (!value || typeof value !== "object") return [];
  const signals = (value as { signals?: unknown }).signals;
  if (!Array.isArray(signals)) return [];

  return signals.filter(
    (signal): signal is WritingSignal =>
      Boolean(signal) &&
      typeof signal === "object" &&
      typeof (signal as WritingSignal).key === "string" &&
      typeof (signal as WritingSignal).label === "string",
  );
}

export default async function ScanDetailPage({
  params,
}: {
  params: Promise<{ scanId: string }>;
}) {
  await requireUser(routes.aiDetector);
  const { scanId } = await params;

  // RLS scopes this to the owner, so "not found" and "not yours" are the same
  // answer — which is the answer we want to give either way.
  const detail = await getScan(scanId);
  if (!detail) notFound();

  const { scan, segments } = detail;
  const confidence = CONFIDENCE_COPY[scan.confidence];
  const signals = readSignals(scan.signals);

  return (
    <div className="space-y-8">
      <PageHeader
        title={scan.title}
        description={`${SOURCE_LABELS[scan.source] ?? scan.source} · ${formatNumber(scan.word_count)} words · ${formatDate(scan.created_at, { dateStyle: "medium", timeStyle: "short" })}`}
        breadcrumbs={[
          { label: "Dashboard", href: routes.dashboard },
          { label: "AI Detector", href: routes.aiDetector },
          { label: "Result" },
        ]}
        actions={<DeleteScanButton scanId={scan.id} />}
      />

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardContent className="p-5 pt-5 sm:p-6 sm:pt-6">
            <LikelihoodMeter likelihood={scan.estimated_ai_likelihood} />

            {scan.summary ? (
              <p className="mt-5 border-t border-line pt-5 text-sm leading-relaxed text-foreground-muted">
                {scan.summary}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle as="h2">How much to trust this</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Badge tone={scan.confidence === "high" ? "brand" : "neutral"}>
              {confidence.label}
            </Badge>
            <p className="text-sm leading-relaxed text-foreground-muted">
              {confidence.explanation}
            </p>
          </CardContent>
        </Card>
      </div>

      {signals.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2">Writing patterns measured</CardTitle>
            <CardDescription>
              Computed directly from your text. Human writing can read as uniform
              on any of these.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SignalList signals={signals} />
          </CardContent>
        </Card>
      ) : null}

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Paragraph by paragraph</h2>
          <p className="mt-1 text-sm text-foreground-muted">
            Where the overall estimate came from. Paragraphs are shown exactly as
            they were analysed.
          </p>
        </div>
        <SegmentView content={scan.content} segments={segments} />
      </section>

      <DetectionDisclaimer />
    </div>
  );
}
