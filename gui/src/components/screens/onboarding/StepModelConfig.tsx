import {
  ArrowSquareOut,
  CheckCircle,
  CircleNotch,
  Eye,
  EyeSlash,
  ListMagnifyingGlass,
  PlugsConnected,
  WarningCircle,
} from "@phosphor-icons/react";
import { useMemo, useState, type ReactNode } from "react";

import { ManagedModelProviderPicker } from "@/components/managed-models/ManagedModelProviderPicker";
import { Button } from "@/components/ui/button";
import {
  listManagedModelOptions,
  managedModelProbeErrorMessage,
  testManagedModelConnectionWithLatency,
} from "@/lib/managed-models";
import { useCopy } from "@/lib/i18n";
import {
  DEFAULT_MANAGED_MODEL_PROVIDER_PRESET_ID,
  getManagedModelProviderPreset,
  managedModelProviderPresetDraft,
  type ManagedModelProviderPresetId,
} from "@/lib/managed-model-presets";
import { cn } from "@/lib/utils";
import { useManagedModelsStore } from "@/stores/managed-models";
import type { ManagedModelProtocol } from "@/types/managed-models";

type SetupAction = "list" | "test" | "start";

type SetupState =
  | { kind: "idle" }
  | { kind: "loading"; action: SetupAction }
  | { kind: "success"; action: SetupAction; message: string }
  | { kind: "error"; action: SetupAction; message: string };

interface StepModelConfigProps {
  onComplete: () => void;
  onAttachExisting: () => void;
  onCancel?: () => void;
  canContinueWithExisting?: boolean;
}

export function StepModelConfig({
  onComplete,
  onAttachExisting,
  onCancel,
  canContinueWithExisting = false,
}: StepModelConfigProps) {
  const copy = useCopy();
  const modelCopy = copy.settings.models;
  const onboardingCopy = copy.onboarding;
  const saveProvider = useManagedModelsStore((s) => s.saveProvider);
  const saveModel = useManagedModelsStore((s) => s.saveModel);
  const initialPresetDraft = managedModelProviderPresetDraft(
    DEFAULT_MANAGED_MODEL_PROVIDER_PRESET_ID,
  );
  const [providerPresetId, setProviderPresetId] =
    useState<ManagedModelProviderPresetId>(initialPresetDraft.providerPresetId);
  const [protocol, setProtocol] = useState<ManagedModelProtocol>(
    initialPresetDraft.protocol,
  );
  const [apiKey, setApiKey] = useState("");
  const [apiBase, setApiBase] = useState(initialPresetDraft.apiBase);
  const [model, setModel] = useState(initialPresetDraft.model);
  const [providerDisplayNameValue, setProviderDisplayNameValue] = useState(
    initialPresetDraft.displayName,
  );
  const [advancedOptions, setAdvancedOptions] = useState<
    Record<string, unknown> | undefined
  >(initialPresetDraft.advancedOptions);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [state, setState] = useState<SetupState>({ kind: "idle" });
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [verifiedFingerprint, setVerifiedFingerprint] = useState<
    string | null
  >(null);
  const selectedPreset = getManagedModelProviderPreset(providerPresetId);
  const apiKeyRevealLabel = apiKeyVisible
    ? modelCopy.hideApiKey
    : modelCopy.showApiKey;
  const connectionFingerprint = useMemo(
    () =>
      JSON.stringify({
        protocol,
        apiKey: apiKey.trim(),
        apiBase: apiBase.trim(),
        model: model.trim(),
      }),
    [apiBase, apiKey, model, protocol],
  );

  const canFetchModels =
    apiKey.trim() !== "" && apiBase.trim() !== "" && state.kind !== "loading";
  const canTestConnection = useMemo(
    () =>
      apiKey.trim() !== "" &&
      apiBase.trim() !== "" &&
      model.trim() !== "" &&
      state.kind !== "loading",
    [apiBase, apiKey, model, state.kind],
  );
  const canStart =
    canTestConnection && verifiedFingerprint === connectionFingerprint;

  const probeInput = () => ({
    protocol,
    apiKey: apiKey.trim(),
    apiBase: apiBase.trim(),
    model: model.trim(),
  });

  const resetConnectionTest = () => {
    setVerifiedFingerprint(null);
    setState({ kind: "idle" });
  };

  const handleSelectProviderPreset = (
    nextProviderPresetId: ManagedModelProviderPresetId,
  ) => {
    const draft = managedModelProviderPresetDraft(nextProviderPresetId);
    setProviderPresetId(draft.providerPresetId);
    setProtocol(draft.protocol);
    setApiBase(draft.apiBase);
    setModel(draft.model);
    setProviderDisplayNameValue(draft.displayName);
    setAdvancedOptions(draft.advancedOptions);
    setModelOptions([]);
    resetConnectionTest();
  };

  const handleFetchModels = async () => {
    if (!canFetchModels) return;
    setState({ kind: "loading", action: "list" });
    try {
      const result = await listManagedModelOptions(probeInput());
      setModelOptions(result.models);
      setState({
        kind: "success",
        action: "list",
        message:
          result.models.length > 0
            ? modelCopy.foundModels(result.models.length)
            : modelCopy.connectedNoModels,
      });
    } catch (e) {
      setState({
        kind: "error",
        action: "list",
        message: managedModelProbeErrorMessage(e, modelCopy),
      });
    }
  };

  const handleTestConnection = async () => {
    if (!canTestConnection) return;
    const fingerprint = connectionFingerprint;
    setVerifiedFingerprint(null);
    setState({ kind: "loading", action: "test" });
    try {
      const result = await testManagedModelConnectionWithLatency(probeInput());
      setVerifiedFingerprint(fingerprint);
      setState({
        kind: "success",
        action: "test",
        message: connectionSuccessMessage(result, modelCopy),
      });
    } catch (e) {
      setState({
        kind: "error",
        action: "test",
        message: managedModelProbeErrorMessage(e, modelCopy),
      });
    }
  };

  const handleStart = async () => {
    if (!canStart) return;
    setState({ kind: "loading", action: "start" });
    try {
      const provider = await saveProvider({
        protocol,
        apiKey: apiKey.trim(),
        apiBase: apiBase.trim(),
        displayName:
          providerDisplayNameValue || providerDisplayName(apiBase.trim()),
      });
      await saveModel({
        providerId: provider.id,
        model: model.trim(),
        advancedOptions,
        makeDefault: true,
      });
      setState({
        kind: "success",
        action: "start",
        message: modelCopy.setupComplete,
      });
      onComplete();
    } catch (e) {
      setState({
        kind: "error",
        action: "start",
        message: managedModelProbeErrorMessage(e, modelCopy),
      });
    }
  };

  return (
    <div className="max-w-[580px]">
      <h1 className="m-0 font-serif text-[34px] font-medium leading-tight tracking-[0.005em] text-ink">
        {onboardingCopy.modelTitle}
      </h1>
      <p className="mb-7 mt-2.5 font-serif text-[15.5px] italic leading-[1.55] text-ink-soft">
        {onboardingCopy.modelSubtitle}
      </p>

      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
            {modelCopy.provider}
          </label>
          <ManagedModelProviderPicker
            value={providerPresetId}
            protocol={protocol}
            onChange={handleSelectProviderPreset}
            className="bg-elevated"
          />
        </div>

        <SetupInput
          label={modelCopy.apiKey}
          type={apiKeyVisible ? "text" : "password"}
          value={apiKey}
          onChange={(value) => {
            setApiKey(value);
            resetConnectionTest();
          }}
          placeholder="sk-..."
          reserveTrailing
          trailing={
            apiKey.length > 0 ? (
              <button
                type="button"
                aria-label={apiKeyRevealLabel}
                title={apiKeyRevealLabel}
                onClick={() => setApiKeyVisible((visible) => !visible)}
                className="inline-flex size-6 items-center justify-center rounded-sm text-ink-muted transition-colors hover:bg-hover hover:text-ink-soft"
              >
                {apiKeyVisible ? (
                  <EyeSlash size={13} weight="thin" />
                ) : (
                  <Eye size={13} weight="thin" />
                )}
              </button>
            ) : null
          }
        />
        <SetupInput
          label={modelCopy.apiUrl}
          value={apiBase}
          onChange={(value) => {
            setApiBase(value);
            resetConnectionTest();
          }}
          placeholder={
            selectedPreset.apiBase ||
            (protocol === "openai"
              ? "https://api.openai.com/v1"
              : "https://api.anthropic.com")
          }
        />
        <SetupInput
          label={modelCopy.model}
          value={model}
          onChange={(value) => {
            setModel(value);
            resetConnectionTest();
          }}
          placeholder={selectedPreset.modelPlaceholder}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="accent-secondary"
            size="sm"
            disabled={!canFetchModels}
            onClick={() => void handleFetchModels()}
            leadingIcon={
              state.kind === "loading" && state.action === "list" ? (
                <span className="spin">
                  <CircleNotch size={12} weight="thin" />
                </span>
              ) : (
                <ListMagnifyingGlass size={12} weight="thin" />
              )
            }
          >
            {modelCopy.fetchModelList}
          </Button>
          <InlineSetupStatus state={state} action="list" />
        </div>
        <SetupErrorLine state={state} action="list" />

        {modelOptions.length > 0 && (
          <select
            value={modelOptions.includes(model) ? model : ""}
            onChange={(e) => {
              setModel(e.target.value);
              resetConnectionTest();
            }}
            className="w-full rounded-sm border border-line bg-elevated px-3 py-2 font-mono text-[13px] text-ink outline-none transition-colors focus:border-brand focus:ring-[3px] focus:ring-brand/20"
          >
            <option value="">{modelCopy.chooseDetectedModel}</option>
            {modelOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="mt-9 flex flex-wrap items-start gap-2">
        <div className="flex flex-wrap items-center gap-3">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="text-[12px] text-ink-muted transition-colors hover:text-brand-strong"
            >
              {onboardingCopy.backToSettings}
            </button>
          )}
          <button
            type="button"
            onClick={onAttachExisting}
            className="inline-flex items-center gap-1 text-[12px] text-ink-muted transition-colors hover:text-brand-strong"
          >
            {onboardingCopy.connectExistingButton}
            <ArrowSquareOut size={11} weight="thin" />
          </button>
        </div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          {canContinueWithExisting && (
            <Button
              variant="secondary"
              size="lg"
              onClick={onComplete}
              leadingIcon={<CheckCircle size={14} weight="thin" />}
            >
              {onboardingCopy.continueWithCurrentModel}
            </Button>
          )}
          <Button
            variant="secondary"
            size="lg"
            disabled={!canTestConnection}
            onClick={() => void handleTestConnection()}
            leadingIcon={
              state.kind === "loading" && state.action === "test" ? (
                <span className="spin">
                  <CircleNotch size={14} weight="thin" />
                </span>
              ) : (
                <PlugsConnected size={14} weight="thin" />
              )
            }
          >
            {modelCopy.testConnection}
          </Button>
          <InlineSetupStatus state={state} action="test" />
          <Button
            variant="primary"
            size="lg"
            disabled={!canStart}
            onClick={() => void handleStart()}
            leadingIcon={
              state.kind === "loading" && state.action === "start" ? (
                <span className="spin">
                  <CircleNotch size={14} weight="thin" />
                </span>
              ) : (
                <CheckCircle size={14} weight="bold" />
              )
            }
          >
            {onboardingCopy.startUsingGalley}
          </Button>
        </div>
      </div>
      <div className="mt-2 flex justify-end">
        <div className="w-full max-w-[420px] space-y-2">
          <SetupErrorLine state={state} action="test" />
          <SetupErrorLine state={state} action="start" />
        </div>
      </div>
    </div>
  );
}

function SetupInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  trailing,
  reserveTrailing = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "password";
  trailing?: ReactNode;
  reserveTrailing?: boolean;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
        {label}
      </label>
      <div className="relative">
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          spellCheck={false}
          className={cn(
            "w-full rounded-sm border border-line bg-elevated px-3 py-2 font-mono text-[13px] text-ink outline-none transition-colors placeholder:text-ink-muted/70 focus:border-brand focus:ring-[3px] focus:ring-brand/20",
            (trailing || reserveTrailing) && "pr-10",
          )}
        />
        {trailing && (
          <div className="absolute right-1.5 top-1/2 -translate-y-1/2">
            {trailing}
          </div>
        )}
      </div>
    </div>
  );
}

function InlineSetupStatus({
  state,
  action,
}: {
  state: SetupState;
  action: SetupAction;
}) {
  if (state.kind !== "success" || state.action !== action) return null;
  return (
    <span
      className="inline-flex min-h-7 max-w-[220px] shrink items-center gap-1 rounded-sm bg-success/10 px-2 py-1 text-[11.5px] leading-none text-success"
      title={state.message}
    >
      <CheckCircle size={11} weight="fill" className="shrink-0" />
      <span className="truncate">{state.message}</span>
    </span>
  );
}

function SetupErrorLine({
  state,
  action,
}: {
  state: SetupState;
  action: SetupAction;
}) {
  if (state.kind !== "error" || state.action !== action) return null;
  return <StatusLine tone="error" message={state.message} />;
}

function StatusLine({
  tone,
  message,
}: {
  tone: "success" | "error";
  message: string;
}) {
  const success = tone === "success";
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-sm border px-3 py-2 text-[12.5px]",
        success
          ? "border-success/20 bg-success/[0.06] text-success"
          : "border-error/20 bg-error/[0.06] text-error",
      )}
    >
      {success ? (
        <CheckCircle size={12} weight="fill" />
      ) : (
        <WarningCircle size={12} weight="fill" />
      )}
      {message}
    </div>
  );
}

function connectionSuccessMessage(
  result: { latencyMs: number; modelFound?: boolean | null },
  copy: ReturnType<typeof useCopy>["settings"]["models"],
): string {
  const message =
    result.modelFound === true ? copy.modelUsable : copy.connectionUsableCanSave;
  return copy.connectionLatency(message, result.latencyMs);
}

function providerDisplayName(apiBase: string): string {
  try {
    return new URL(apiBase).hostname;
  } catch {
    return apiBase.trim();
  }
}
