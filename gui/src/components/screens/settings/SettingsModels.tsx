import {
  CheckCircle,
  CircleNotch,
  Key,
  Plus,
  Trash,
  WarningCircle,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";

import {
  SettingsPanelHeader,
  SettingsSectionLabel,
} from "@/components/screens/settings/settings-ui";
import { Button, IconButton } from "@/components/ui/button";
import { useManagedModelsStore } from "@/stores/managed-models";
import type { ManagedModelProtocol } from "@/types/managed-models";
import { cn } from "@/lib/utils";

export function SettingsModels() {
  const models = useManagedModelsStore((s) => s.models);
  const loading = useManagedModelsStore((s) => s.loading);
  const saving = useManagedModelsStore((s) => s.saving);
  const error = useManagedModelsStore((s) => s.error);
  const load = useManagedModelsStore((s) => s.load);
  const save = useManagedModelsStore((s) => s.save);
  const deleteModel = useManagedModelsStore((s) => s.delete);

  const [protocol, setProtocol] =
    useState<ManagedModelProtocol>("openai");
  const [apiKey, setApiKey] = useState("");
  const [apiBase, setApiBase] = useState("");
  const [model, setModel] = useState("");
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    void load();
  }, [load]);

  const canSave = useMemo(
    () =>
      apiKey.trim() !== "" &&
      apiBase.trim() !== "" &&
      model.trim() !== "" &&
      !saving,
    [apiBase, apiKey, model, saving],
  );

  const handleSave = async () => {
    if (!canSave) return;
    await save({
      protocol,
      apiKey,
      apiBase,
      model,
      displayName,
      makeDefault: models.length === 0,
    });
    setApiKey("");
    setApiBase("");
    setModel("");
    setDisplayName("");
  };

  return (
    <div className="space-y-7">
      <SettingsPanelHeader
        title="Models"
        subtitle="Galley 内置 GA 使用的模型 · API Key 保存在系统 Keychain"
      />

      <div>
        <SettingsSectionLabel>添加模型</SettingsSectionLabel>
        <div className="mt-3 space-y-4">
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
              模型服务
            </label>
            <div className="inline-flex rounded-sm border border-line bg-surface p-0.5">
              <ProtocolButton
                active={protocol === "openai"}
                label="OpenAI-compatible"
                onClick={() => setProtocol("openai")}
              />
              <ProtocolButton
                active={protocol === "anthropic"}
                label="Anthropic-compatible"
                onClick={() => setProtocol("anthropic")}
              />
            </div>
          </div>

          <SettingsInput
            label="模型密钥"
            value={apiKey}
            onChange={setApiKey}
            type="password"
            placeholder="sk-..."
          />
          <SettingsInput
            label="Base URL"
            value={apiBase}
            onChange={setApiBase}
            placeholder={
              protocol === "openai"
                ? "https://api.openai.com/v1"
                : "https://api.anthropic.com"
            }
          />
          <SettingsInput
            label="模型"
            value={model}
            onChange={setModel}
            placeholder={
              protocol === "openai" ? "gpt-4.1" : "claude-sonnet-4-6"
            }
          />
          <SettingsInput
            label="显示名"
            value={displayName}
            onChange={setDisplayName}
            placeholder="可选；默认使用模型名"
          />

          {error && (
            <div className="rounded-sm border border-error/20 bg-error/[0.06] px-3 py-2 text-[12.5px] text-error">
              {error}
            </div>
          )}

          <Button
            variant="primary"
            size="lg"
            disabled={!canSave}
            onClick={() => void handleSave()}
            leadingIcon={
              saving ? (
                <span className="spin">
                  <CircleNotch size={14} weight="thin" />
                </span>
              ) : (
                <Plus size={14} weight="bold" />
              )
            }
          >
            保存模型
          </Button>
        </div>
      </div>

      <div>
        <SettingsSectionLabel>已保存</SettingsSectionLabel>
        <div className="mt-2 divide-y divide-line rounded-sm border border-line bg-surface">
          {loading && (
            <div className="flex items-center gap-2 px-3 py-3 text-[12.5px] text-ink-muted">
              <span className="spin">
                <CircleNotch size={13} weight="thin" />
              </span>
              加载中…
            </div>
          )}
          {!loading && models.length === 0 && (
            <div className="px-3 py-3 text-[12.5px] text-ink-muted">
              还没有模型。
            </div>
          )}
          {!loading &&
            models.map((item) => (
              <div
                key={item.id}
                className="flex min-w-0 items-center gap-3 px-3 py-2.5"
              >
                <Key size={16} weight="thin" className="shrink-0 text-ink-soft" />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="truncate text-[13px] font-medium text-ink">
                      {item.displayName}
                    </div>
                    {item.isDefault && (
                      <span className="shrink-0 rounded-sm bg-brand-soft px-1.5 py-px text-[10.5px] text-brand-strong">
                        默认
                      </span>
                    )}
                    <CredentialBadge status={item.credentialStatus} />
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[11.5px] text-ink-muted">
                    {protocolLabel(item.protocol)} · {item.model} ·{" "}
                    {item.apiBase}
                  </div>
                </div>
                <IconButton
                  ariaLabel="删除模型"
                  variant="danger"
                  size="sm"
                  disabled={saving}
                  onClick={() => void deleteModel(item.id)}
                >
                  <Trash size={13} weight="thin" />
                </IconButton>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

function ProtocolButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-[3px] px-2.5 py-1.5 text-[12px] transition-colors",
        active ? "bg-elevated text-ink shadow-sm" : "text-ink-muted hover:text-ink",
      )}
    >
      {label}
    </button>
  );
}

function SettingsInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "password";
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        className="w-full rounded-sm border border-line bg-surface px-3 py-2 font-mono text-[12.5px] text-ink outline-none transition-colors placeholder:text-ink-muted/70 focus:border-brand focus:ring-[3px] focus:ring-brand/20"
      />
    </div>
  );
}

function CredentialBadge({
  status,
}: {
  status: "present" | "missing" | "unknown";
}) {
  if (status === "present") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-sm bg-success/10 px-1.5 py-px text-[10.5px] text-success">
        <CheckCircle size={10} weight="fill" />
        Key 已保存
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-sm bg-warning/10 px-1.5 py-px text-[10.5px] text-warning">
      <WarningCircle size={10} weight="fill" />
      Key 缺失
    </span>
  );
}

function protocolLabel(protocol: ManagedModelProtocol): string {
  return protocol === "openai" ? "OpenAI-compatible" : "Anthropic-compatible";
}
