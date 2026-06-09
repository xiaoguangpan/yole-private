import { ArrowSquareOut } from "@phosphor-icons/react";

import {
  SettingsPanelHeader,
  SettingsSectionLabel,
} from "@/components/screens/settings/settings-ui";
import { SettingsUpdateControl } from "@/components/screens/settings/SettingsUpdateControl";
import { useCopy } from "@/lib/i18n";
import type { ManagedRuntimeDiagnostics } from "@/types/inspector";

interface SettingsAboutProps {
  yoleVersion: string;
  gaBaseline: string;
  managedRuntime?: ManagedRuntimeDiagnostics;
  hasRunningSessions: boolean;
}

/**
 * Settings → About tab. DESIGN.md §9 About tab.
 *
 * Structure:
 *   1. Title + tagline
 *   2. Version table (Yole + bundled GenericAgent kernel)
 *   3. Links — Yole website and GenericAgent upstream credit.
 *   4. Footer with product ownership.
 */
export function SettingsAbout({
  yoleVersion,
  gaBaseline,
  managedRuntime,
  hasRunningSessions,
}: SettingsAboutProps) {
  const copy = useCopy();
  const managedKernelCommit =
    managedRuntime?.upstreamCommit || gaBaseline || "unknown";
  const managedKernelShort =
    managedKernelCommit === "unknown"
      ? "unknown"
      : managedKernelCommit.slice(0, 7);
  const managedKernelDate = managedRuntime?.upstreamAuditedAt;

  return (
    <div className="space-y-7">
      <SettingsPanelHeader
        title="Yole"
        subtitle={copy.settings.about.subtitle}
        wordmark
      />

      <dl className="m-0 grid grid-cols-[120px_1fr] gap-y-2 text-[12.5px]">
        <dt className="text-ink-muted">{copy.settings.about.yoleVersion}</dt>
        <dd className="m-0 min-w-0">
          <SettingsUpdateControl
            hasRunningSessions={hasRunningSessions}
            leading={
              <span className="font-mono text-ink">v{yoleVersion}</span>
            }
          />
        </dd>

        <dt className="text-ink-muted">
          {copy.settings.about.bundledGAVersion}
        </dt>
        <dd className="m-0 font-mono text-ink">
          {managedKernelShort}
          {managedKernelDate && (
            <span className="text-ink-muted"> · {managedKernelDate}</span>
          )}
        </dd>
      </dl>

      <div className="mt-10">
        <SettingsSectionLabel>{copy.settings.about.links}</SettingsSectionLabel>
        <div className="mt-3 space-y-1">
          <ExternalLink
            href="https://github.com/xiaoguangpan/yole"
            label="Yole"
            detail="github.com/xiaoguangpan/yole"
          />
          <ExternalLink
            href="https://github.com/lsdefine/GenericAgent"
            label="GenericAgent"
            detail="github.com/lsdefine/GenericAgent"
          />
        </div>
      </div>

      <div className="border-t border-line pt-4 text-[12px] text-ink-muted">
        {copy.settings.about.madeBy}
      </div>
    </div>
  );
}

function ExternalLink({
  href,
  label,
  detail,
}: {
  href: string;
  label: string;
  detail: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="group grid min-w-0 grid-cols-[120px_1fr_18px] items-baseline gap-3 rounded-sm px-1 py-1 text-[13px] transition-colors hover:bg-hover"
    >
      <span className="font-medium text-ink">{label}</span>
      <span className="min-w-0 text-ink-muted group-hover:text-ink-soft">
        {detail}
      </span>
      <ArrowSquareOut
        size={11}
        weight="thin"
        className="shrink-0 translate-y-px text-ink-muted transition-colors group-hover:text-brand-strong"
      />
    </a>
  );
}
