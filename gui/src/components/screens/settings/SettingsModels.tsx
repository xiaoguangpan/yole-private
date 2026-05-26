import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  ArrowDown,
  ArrowUp,
  CaretDown,
  CaretRight,
  CheckCircle,
  CircleNotch,
  DotsThreeVertical,
  Eye,
  EyeSlash,
  Info,
  Key,
  ListMagnifyingGlass,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  PlugsConnected,
  Star,
  Trash,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { ManagedModelProviderPicker } from "@/components/managed-models/ManagedModelProviderPicker";
import {
  SettingsPanelHeader,
  SettingsSectionLabel,
} from "@/components/screens/settings/settings-ui";
import { Button, IconButton } from "@/components/ui/button";
import {
  listManagedModelOptions,
  managedModelProbeErrorMessage,
  testManagedModelConnectionWithLatency,
  type TimedManagedModelConnectionResult,
} from "@/lib/managed-models";
import { useCopy } from "@/lib/i18n";
import {
  advancedOptionsForManagedModelProvider,
  customManagedModelProviderPresetId,
  DEFAULT_MANAGED_MODEL_PROVIDER_PRESET_ID,
  getManagedModelProviderPreset,
  managedModelProviderPresetDraft,
  managedModelProtocolLabel,
  type ManagedModelProviderPresetId,
} from "@/lib/managed-model-presets";
import { cn } from "@/lib/utils";
import { useManagedModelsStore } from "@/stores/managed-models";
import type {
  ManagedModelProtocol,
  ManagedModelProviderRecord,
  ManagedModelRecord,
} from "@/types/managed-models";
import type { RuntimeKind } from "@/types/session";

type ProbeAction = "provider-test" | "model-list" | "model-test";

type ProbeState =
  | { kind: "idle" }
  | { kind: "loading"; action: ProbeAction }
  | { kind: "success"; action: ProbeAction; message: string }
  | { kind: "error"; action: ProbeAction; message: string };

type ProbeStateMap = Record<string, ProbeState>;

const idleProbeState: ProbeState = { kind: "idle" };

type ProviderFormState = {
  id?: string;
  providerPresetId: ManagedModelProviderPresetId;
  protocol: ManagedModelProtocol;
  apiKey: string;
  apiBase: string;
  model: string;
  displayName: string;
  advancedOptions?: Record<string, unknown>;
};

type ModelDraftState = {
  providerId: string;
  id?: string;
  model: string;
  displayName: string;
};

type ModelMoveDirection = "up" | "down";

type ModelMoveFeedbackState = {
  movedId: string;
  swappedId: string;
  direction: ModelMoveDirection;
  nonce: number;
};

function newProviderForm(): ProviderFormState {
  return providerFormFromPreset(DEFAULT_MANAGED_MODEL_PROVIDER_PRESET_ID);
}

function providerFormFromPreset(
  providerPresetId: ManagedModelProviderPresetId,
  preserved?: Pick<ProviderFormState, "id" | "apiKey">,
): ProviderFormState {
  const draft = managedModelProviderPresetDraft(providerPresetId);
  return {
    ...(preserved?.id ? { id: preserved.id } : {}),
    ...draft,
    apiKey: preserved?.apiKey ?? "",
  };
}

function probeStateFor(states: ProbeStateMap, id: string): ProbeState {
  return states[id] ?? idleProbeState;
}

function withProbeState(
  states: ProbeStateMap,
  id: string,
  state: ProbeState,
): ProbeStateMap {
  return { ...states, [id]: state };
}

function withoutProbeState(states: ProbeStateMap, id: string): ProbeStateMap {
  if (!(id in states)) return states;
  const next = { ...states };
  delete next[id];
  return next;
}

export function SettingsModels({
  activeRuntimeKind = "managed",
}: {
  activeRuntimeKind?: RuntimeKind;
}) {
  const copy = useCopy();
  const modelCopy = copy.settings.models;
  const providers = useManagedModelsStore((s) => s.providers);
  const models = useManagedModelsStore((s) => s.models);
  const loading = useManagedModelsStore((s) => s.loading);
  const saving = useManagedModelsStore((s) => s.saving);
  const error = useManagedModelsStore((s) => s.error);
  const load = useManagedModelsStore((s) => s.load);
  const saveProvider = useManagedModelsStore((s) => s.saveProvider);
  const deleteProvider = useManagedModelsStore((s) => s.deleteProvider);
  const saveModel = useManagedModelsStore((s) => s.saveModel);
  const reorderModels = useManagedModelsStore((s) => s.reorderModels);
  const deleteModel = useManagedModelsStore((s) => s.deleteModel);

  const [providerForm, setProviderForm] = useState<ProviderFormState | null>(
    null,
  );
  const [providerFormProbeState, setProviderFormProbeState] =
    useState<ProbeState>({ kind: "idle" });
  const [expandedProviderIds, setExpandedProviderIds] = useState<string[]>([]);
  const [providerProbeStates, setProviderProbeStates] =
    useState<ProbeStateMap>({});
  const [modelProbeStates, setModelProbeStates] = useState<ProbeStateMap>({});
  const [savedModelProbeStates, setSavedModelProbeStates] =
    useState<ProbeStateMap>({});
  const [modelOptionsByProvider, setModelOptionsByProvider] = useState<
    Record<string, string[]>
  >({});
  const [providerFormModelOptions, setProviderFormModelOptions] = useState<
    string[]
  >([]);
  const [modelFilterByProvider, setModelFilterByProvider] = useState<
    Record<string, string>
  >({});
  const [modelDraft, setModelDraft] = useState<ModelDraftState | null>(null);
  const [optimisticModelIds, setOptimisticModelIds] = useState<string[] | null>(
    null,
  );
  const [modelMoveFeedback, setModelMoveFeedback] =
    useState<ModelMoveFeedbackState | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  const orderedModels = useMemo(
    () => applyModelOrder(models, optimisticModelIds),
    [models, optimisticModelIds],
  );

  const modelsByProvider = useMemo(() => {
    const grouped: Record<string, ManagedModelRecord[]> = {};
    for (const model of orderedModels) {
      grouped[model.providerId] = grouped[model.providerId] ?? [];
      grouped[model.providerId].push(model);
    }
    return grouped;
  }, [orderedModels]);
  const visibleProviderForm =
    providerForm ??
    (!loading && providers.length === 0 ? newProviderForm() : null);
  const editingProvider = visibleProviderForm?.id
    ? providers.find((item) => item.id === visibleProviderForm.id)
    : undefined;
  const providerHasSavedKey =
    !!editingProvider && editingProvider.credentialStatus !== "missing";
  const isCreatingProvider = !!visibleProviderForm && !visibleProviderForm.id;
  const canSaveProvider =
    !!visibleProviderForm &&
    visibleProviderForm.apiBase.trim() !== "" &&
    (visibleProviderForm.apiKey.trim() !== "" || providerHasSavedKey) &&
    (!isCreatingProvider || visibleProviderForm.model.trim() !== "") &&
    !saving;
  const canTestProvider =
    !!visibleProviderForm &&
    visibleProviderForm.apiBase.trim() !== "" &&
    (visibleProviderForm.apiKey.trim() !== "" || providerHasSavedKey) &&
    providerFormProbeState.kind !== "loading";
  const canFetchProviderFormModels =
    !!visibleProviderForm &&
    !visibleProviderForm.id &&
    visibleProviderForm.apiBase.trim() !== "" &&
    visibleProviderForm.apiKey.trim() !== "" &&
    providerFormProbeState.kind !== "loading";

  const expandProvider = (id: string) => {
    setExpandedProviderIds((current) =>
      current.includes(id) ? current : [...current, id],
    );
  };

  const isProviderExpanded = (id: string) => expandedProviderIds.includes(id);

  const toggleProvider = (id: string) => {
    if (isProviderExpanded(id)) {
      setExpandedProviderIds((current) =>
        current.filter((item) => item !== id),
      );
      return;
    }
    expandProvider(id);
  };

  const updateProviderForm = (patch: Partial<ProviderFormState>) => {
    setProviderForm((current) => ({
      ...(current ?? newProviderForm()),
      ...patch,
    }));
    if (
      "protocol" in patch ||
      "providerPresetId" in patch ||
      "apiKey" in patch ||
      "apiBase" in patch
    ) {
      setProviderFormModelOptions([]);
    }
    setProviderFormProbeState({ kind: "idle" });
  };

  const selectProviderPreset = (
    providerPresetId: ManagedModelProviderPresetId,
  ) => {
    setProviderForm((current) => {
      const base = current ?? newProviderForm();
      return providerFormFromPreset(providerPresetId, {
        id: base.id,
        apiKey: base.apiKey,
      });
    });
    setProviderFormModelOptions([]);
    setProviderFormProbeState({ kind: "idle" });
  };

  const resetProviderForm = () => {
    setProviderForm(null);
    setProviderFormModelOptions([]);
    setProviderFormProbeState({ kind: "idle" });
  };

  const resetModelDraft = () => {
    const providerId = modelDraft?.providerId;
    setModelDraft(null);
    if (providerId) {
      setModelProbeStates((current) =>
        withoutProbeState(current, providerId),
      );
    }
  };

  const handleProviderFormTest = async () => {
    if (!visibleProviderForm || !canTestProvider) return;
    const testModel = visibleProviderForm.model.trim();
    setProviderFormProbeState({
      kind: "loading",
      action: "provider-test",
    });
    try {
      const result = await testManagedModelConnectionWithLatency({
        id: visibleProviderForm.id,
        providerId: visibleProviderForm.id,
        protocol: visibleProviderForm.protocol,
        apiKey: visibleProviderForm.apiKey || undefined,
        apiBase: visibleProviderForm.apiBase,
        model: testModel || undefined,
      });
      setProviderFormProbeState({
        kind: "success",
        action: "provider-test",
        message: connectionSuccessMessage(
          result,
          testModel ? "setup-model" : "provider",
          modelCopy,
        ),
      });
    } catch (e) {
      setProviderFormProbeState({
        kind: "error",
        action: "provider-test",
        message: managedModelProbeErrorMessage(e, modelCopy),
      });
    }
  };

  const handleProviderFormFetchModels = async () => {
    if (!visibleProviderForm || !canFetchProviderFormModels) return;
    setProviderFormProbeState({
      kind: "loading",
      action: "model-list",
    });
    try {
      const result = await listManagedModelOptions({
        protocol: visibleProviderForm.protocol,
        apiKey: visibleProviderForm.apiKey,
        apiBase: visibleProviderForm.apiBase,
      });
      setProviderFormModelOptions(result.models);
      if (
        result.models.length === 1 &&
        visibleProviderForm.model.trim() === ""
      ) {
        setProviderForm((current) =>
          current ? { ...current, model: result.models[0] } : current,
        );
      }
      setProviderFormProbeState({
        kind: "success",
        action: "model-list",
        message:
          result.models.length > 0
            ? modelCopy.foundModels(result.models.length)
            : modelCopy.connectedNoModels,
      });
    } catch (e) {
      setProviderFormProbeState({
        kind: "error",
        action: "model-list",
        message: managedModelProbeErrorMessage(e, modelCopy),
      });
    }
  };

  const handleProviderSave = async () => {
    if (!visibleProviderForm || !canSaveProvider) return;
    const isNewProvider = !visibleProviderForm.id;
    try {
      const saved = await saveProvider({
        id: visibleProviderForm.id,
        protocol: visibleProviderForm.protocol,
        apiKey: visibleProviderForm.apiKey || undefined,
        apiBase: visibleProviderForm.apiBase,
        displayName: visibleProviderForm.displayName,
      });
      if (isNewProvider) {
        await saveModel({
          providerId: saved.id,
          model: visibleProviderForm.model.trim(),
          displayName: "",
          advancedOptions: visibleProviderForm.advancedOptions,
          makeDefault: models.length === 0,
        });
      }
      setProviderProbeStates((current) =>
        withoutProbeState(current, saved.id),
      );
      setModelProbeStates((current) => withoutProbeState(current, saved.id));
      expandProvider(saved.id);
      resetProviderForm();
    } catch {
      // Store-level error is shown inline.
    }
  };

  const handleProviderTest = async (provider: ManagedModelProviderRecord) => {
    if (provider.credentialStatus === "missing") return;
    const providerTestModel = (modelsByProvider[provider.id] ?? [])[0]?.model;
    setProviderProbeStates((current) =>
      withProbeState(current, provider.id, {
        kind: "loading",
        action: "provider-test",
      }),
    );
    try {
      const result = await testManagedModelConnectionWithLatency({
        id: provider.id,
        providerId: provider.id,
        protocol: provider.protocol,
        apiBase: provider.apiBase,
        model: providerTestModel,
      });
      setProviderProbeStates((current) =>
        withProbeState(current, provider.id, {
          kind: "success",
          action: "provider-test",
          message: connectionSuccessMessage(result, "provider", modelCopy),
        }),
      );
    } catch (e) {
      setProviderProbeStates((current) =>
        withProbeState(current, provider.id, {
          kind: "error",
          action: "provider-test",
          message: managedModelProbeErrorMessage(e, modelCopy),
        }),
      );
    }
  };

  const handleFetchModels = async (provider: ManagedModelProviderRecord) => {
    if (provider.credentialStatus === "missing") return;
    expandProvider(provider.id);
    setModelProbeStates((current) =>
      withProbeState(current, provider.id, {
        kind: "loading",
        action: "model-list",
      }),
    );
    try {
      const result = await listManagedModelOptions({
        providerId: provider.id,
        protocol: provider.protocol,
        apiBase: provider.apiBase,
      });
      setModelOptionsByProvider((current) => ({
        ...current,
        [provider.id]: result.models,
      }));
      if (result.models.length === 0) {
        setModelDraft({
          providerId: provider.id,
          model: "",
          displayName: "",
        });
      }
      setModelProbeStates((current) =>
        withProbeState(current, provider.id, {
          kind: "success",
          action: "model-list",
          message:
            result.models.length > 0
              ? modelCopy.foundModels(result.models.length)
              : modelCopy.connectedNoModels,
        }),
      );
    } catch (e) {
      setModelProbeStates((current) =>
        withProbeState(current, provider.id, {
          kind: "error",
          action: "model-list",
          message: managedModelProbeErrorMessage(e, modelCopy),
        }),
      );
    }
  };

  const handleTestDraftModel = async (
    provider: ManagedModelProviderRecord,
    draft: ModelDraftState,
  ) => {
    if (provider.credentialStatus === "missing" || draft.model.trim() === "") {
      return;
    }
    setModelProbeStates((current) =>
      withProbeState(current, provider.id, {
        kind: "loading",
        action: "model-test",
      }),
    );
    try {
      const result = await testManagedModelConnectionWithLatency({
        providerId: provider.id,
        protocol: provider.protocol,
        apiBase: provider.apiBase,
        model: draft.model,
      });
      setModelProbeStates((current) =>
        withProbeState(current, provider.id, {
          kind: "success",
          action: "model-test",
          message: connectionSuccessMessage(result, "setup-model", modelCopy),
        }),
      );
    } catch (e) {
      setModelProbeStates((current) =>
        withProbeState(current, provider.id, {
          kind: "error",
          action: "model-test",
          message: managedModelProbeErrorMessage(e, modelCopy),
        }),
      );
    }
  };

  const handleSaveDraftModel = async (draft: ModelDraftState) => {
    const draftId = draft.id;
    const existingModel = draft.id
      ? models.find((item) => item.id === draft.id)
      : undefined;
    const draftProvider = providers.find(
      (item) => item.id === draft.providerId,
    );
    try {
      await saveModel({
        id: draft.id,
        providerId: draft.providerId,
        model: draft.model,
        displayName: normalizedModelDisplayName(draft),
        advancedOptions:
          existingModel?.advancedOptions ??
          (draftProvider
            ? advancedOptionsForManagedModelProvider(draftProvider)
            : undefined),
        makeDefault: draft.id
          ? (existingModel?.isDefault ?? false)
          : models.length === 0,
      });
      if (draftId) {
        setSavedModelProbeStates((current) =>
          withoutProbeState(current, draftId),
        );
      }
      resetModelDraft();
    } catch {
      // Store-level error is shown inline.
    }
  };

  const handleEnableDetectedModel = async (
    provider: ManagedModelProviderRecord,
    modelName: string,
  ) => {
    const alreadyEnabled = models.some(
      (item) => item.providerId === provider.id && item.model === modelName,
    );
    if (alreadyEnabled) return;
    try {
      await saveModel({
        providerId: provider.id,
        model: modelName,
        displayName: "",
        advancedOptions: advancedOptionsForManagedModelProvider(provider),
        makeDefault: models.length === 0,
      });
    } catch {
      // Store-level error is shown inline.
    }
  };

  const handleSetDefaultModel = async (model: ManagedModelRecord) => {
    if (orderedModels[0]?.id === model.id) return;
    const currentIndex = orderedModels.findIndex(
      (item) => item.id === model.id,
    );
    const next =
      currentIndex > 0
        ? [model, ...orderedModels.filter((item) => item.id !== model.id)]
        : orderedModels;
    const nonce = Date.now();
    if (currentIndex > 0) {
      setOptimisticModelIds(next.map((item) => item.id));
      setModelMoveFeedback({
        movedId: model.id,
        swappedId: orderedModels[0]?.id ?? model.id,
        direction: "up",
        nonce,
      });
      window.setTimeout(() => {
        setModelMoveFeedback((current) =>
          current?.nonce === nonce ? null : current,
        );
      }, 320);
    }
    try {
      await saveModel({
        id: model.id,
        providerId: model.providerId,
        model: model.model,
        displayName: model.displayName,
        advancedOptions: model.advancedOptions,
        makeDefault: true,
      });
      setOptimisticModelIds(null);
    } catch {
      setOptimisticModelIds(null);
      // Store-level error is shown inline.
    }
  };

  const handleTestSavedModel = async (model: ManagedModelRecord) => {
    const provider = providers.find((item) => item.id === model.providerId);
    if (!provider || provider.credentialStatus === "missing") return;
    setSavedModelProbeStates((current) =>
      withProbeState(current, model.id, {
        kind: "loading",
        action: "model-test",
      }),
    );
    try {
      const result = await testManagedModelConnectionWithLatency({
        providerId: provider.id,
        protocol: provider.protocol,
        apiBase: provider.apiBase,
        model: model.model,
      });
      setSavedModelProbeStates((current) =>
        withProbeState(current, model.id, {
          kind: "success",
          action: "model-test",
          message: connectionSuccessMessage(result, "saved-model", modelCopy),
        }),
      );
    } catch (e) {
      setSavedModelProbeStates((current) =>
        withProbeState(current, model.id, {
          kind: "error",
          action: "model-test",
          message: managedModelProbeErrorMessage(e, modelCopy),
        }),
      );
    }
  };

  const handleDeleteProvider = (provider: ManagedModelProviderRecord) => {
    const providerModels = modelsByProvider[provider.id] ?? [];
    const suffix =
      providerModels.length > 0
        ? modelCopy.deleteProviderSuffix(providerModels.length)
        : "";
    if (
      window.confirm(
        modelCopy.confirmDeleteProvider(provider.displayName, suffix),
      )
    ) {
      void deleteProvider(provider.id);
    }
  };

  const handleDeleteModel = (model: ManagedModelRecord) => {
    if (
      window.confirm(
        modelCopy.confirmRemoveModel(modelDisplayParts(model).title),
      )
    ) {
      void deleteModel(model.id);
    }
  };

  const handleMoveConfiguredModel = async (
    modelId: string,
    direction: ModelMoveDirection,
  ) => {
    if (saving || orderedModels.length <= 1) return;
    const sourceIndex = orderedModels.findIndex((item) => item.id === modelId);
    const targetIndex = direction === "up" ? sourceIndex - 1 : sourceIndex + 1;
    if (
      sourceIndex < 0 ||
      targetIndex < 0 ||
      targetIndex >= orderedModels.length
    ) {
      return;
    }
    const next = [...orderedModels];
    const swapped = next[targetIndex];
    [next[sourceIndex], next[targetIndex]] = [
      next[targetIndex],
      next[sourceIndex],
    ];
    const nonce = Date.now();
    setOptimisticModelIds(next.map((item) => item.id));
    setModelMoveFeedback({
      movedId: modelId,
      swappedId: swapped.id,
      direction,
      nonce,
    });
    window.setTimeout(() => {
      setModelMoveFeedback((current) =>
        current?.nonce === nonce ? null : current,
      );
    }, 320);
    try {
      await reorderModels(next.map((item) => item.id));
      setOptimisticModelIds(null);
    } catch {
      setOptimisticModelIds(null);
    }
  };

  return (
    <div className="space-y-6">
      <SettingsPanelHeader
        title={copy.settings.tabs.models.label}
        subtitle={modelCopy.subtitle}
      />

      {activeRuntimeKind === "external" && <ExternalRuntimeNotice />}

      <ConfiguredModelsPanel
        models={orderedModels}
        saving={saving}
        moveFeedback={modelMoveFeedback}
        onMoveModel={handleMoveConfiguredModel}
        onAddProvider={() => {
          setProviderForm(newProviderForm());
          setProviderFormModelOptions([]);
          setProviderFormProbeState({ kind: "idle" });
        }}
      />

      {visibleProviderForm && (
        <ProviderEditor
          form={visibleProviderForm}
          saving={saving}
          canSave={canSaveProvider}
          canTest={canTestProvider}
          canFetchModels={canFetchProviderFormModels}
          canCancel={providers.length > 0 || !!visibleProviderForm.id}
          providerHasSavedKey={providerHasSavedKey}
          probeState={providerFormProbeState}
          modelOptions={providerFormModelOptions}
          onChange={updateProviderForm}
          onSelectProviderPreset={selectProviderPreset}
          onTest={() => void handleProviderFormTest()}
          onFetchModels={() => void handleProviderFormFetchModels()}
          onSave={() => void handleProviderSave()}
          onCancel={resetProviderForm}
        />
      )}

      {error && <ErrorLine message={error} />}

      <div>
        <SettingsSectionLabel>
          {modelCopy.connectedProviders}
        </SettingsSectionLabel>
        <div className="mt-3 divide-y divide-line rounded-sm border border-line bg-surface">
          {loading && <LoadingRow />}
          {!loading && providers.length === 0 && (
            <EmptyRow text={modelCopy.noProviders} />
          )}
          {!loading &&
            providers.map((provider) => (
              <ProviderCard
                key={provider.id}
                provider={provider}
                models={modelsByProvider[provider.id] ?? []}
                defaultModelId={orderedModels[0]?.id}
                allModelCount={orderedModels.length}
                saving={saving}
                expanded={isProviderExpanded(provider.id)}
                providerProbeState={probeStateFor(
                  providerProbeStates,
                  provider.id,
                )}
                modelProbeState={probeStateFor(
                  modelProbeStates,
                  provider.id,
                )}
                modelOptions={modelOptionsByProvider[provider.id] ?? []}
                modelFilter={modelFilterByProvider[provider.id] ?? ""}
                modelDraft={
                  modelDraft?.providerId === provider.id ? modelDraft : null
                }
                onToggle={() => toggleProvider(provider.id)}
                onEditProvider={() => {
                  setProviderForm({
                    id: provider.id,
                    providerPresetId: customManagedModelProviderPresetId(
                      provider.protocol,
                    ),
                    protocol: provider.protocol,
                    apiKey: "",
                    apiBase: provider.apiBase,
                    model: "",
                    displayName: provider.displayName,
                  });
                  setProviderFormModelOptions([]);
                  setProviderFormProbeState({ kind: "idle" });
                }}
                onDeleteProvider={() => handleDeleteProvider(provider)}
                onTestProvider={() => void handleProviderTest(provider)}
                onFetchModels={() => void handleFetchModels(provider)}
                onSetModelFilter={(value) =>
                  setModelFilterByProvider((current) => ({
                    ...current,
                    [provider.id]: value,
                  }))
                }
                onStartModelDraft={(model) => {
                  expandProvider(provider.id);
                  setModelDraft(
                    model
                      ? {
                          providerId: provider.id,
                          id: model.id,
                          model: model.model,
                          displayName:
                            model.displayName === model.model
                              ? ""
                              : model.displayName,
                        }
                      : {
                          providerId: provider.id,
                          model: "",
                          displayName: "",
                        },
                  );
                  setModelProbeStates((current) =>
                    withoutProbeState(current, provider.id),
                  );
                }}
                onChangeModelDraft={(patch) => {
                  setModelDraft((current) =>
                    current?.providerId === provider.id
                      ? { ...current, ...patch }
                      : current,
                  );
                  setModelProbeStates((current) =>
                    withoutProbeState(current, provider.id),
                  );
                }}
                onCancelModelDraft={resetModelDraft}
                onTestModelDraft={(draft) =>
                  void handleTestDraftModel(provider, draft)
                }
                onSaveModelDraft={(draft) => void handleSaveDraftModel(draft)}
                onEnableDetectedModel={(modelName) =>
                  void handleEnableDetectedModel(provider, modelName)
                }
                onSetDefaultModel={(model) => void handleSetDefaultModel(model)}
                onTestModel={(model) => void handleTestSavedModel(model)}
                modelProbeStateFor={(modelId) =>
                  probeStateFor(savedModelProbeStates, modelId)
                }
                onDeleteModel={handleDeleteModel}
              />
            ))}
        </div>
      </div>
    </div>
  );
}

function ConfiguredModelsPanel({
  models,
  saving,
  moveFeedback,
  onMoveModel,
  onAddProvider,
}: {
  models: ManagedModelRecord[];
  saving: boolean;
  moveFeedback: ModelMoveFeedbackState | null;
  onMoveModel: (modelId: string, direction: ModelMoveDirection) => void;
  onAddProvider: () => void;
}) {
  const appCopy = useCopy();
  const copy = appCopy.settings.models;
  return (
    <div className="rounded-sm border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
            {copy.configuredModels}
          </div>
          <div className="mt-1 text-[12.5px] text-ink-muted">
            {models.length > 0
              ? copy.enabledModelsCount(models.length)
              : copy.noEnabledModels}
          </div>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={onAddProvider}
          leadingIcon={<Plus size={12} weight="bold" />}
        >
          {copy.addProvider}
        </Button>
      </div>
      {models.length > 0 && (
        <div className="divide-y divide-line border-t border-line">
          {models.map((model, index) => (
            <ConfiguredModelRow
              key={model.id}
              model={model}
              isDefault={index === 0}
              canMoveUp={!saving && index > 0}
              canMoveDown={!saving && index < models.length - 1}
              moveFeedback={moveFeedback}
              onMoveUp={() => onMoveModel(model.id, "up")}
              onMoveDown={() => onMoveModel(model.id, "down")}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ConfiguredModelRow({
  model,
  isDefault,
  canMoveUp,
  canMoveDown,
  moveFeedback,
  onMoveUp,
  onMoveDown,
}: {
  model: ManagedModelRecord;
  isDefault: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  moveFeedback: ModelMoveFeedbackState | null;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const appCopy = useCopy();
  const copy = appCopy.settings.models;
  const swapClass = modelSwapAnimationClass(model.id, moveFeedback);
  const modelTitle = modelDisplayParts(model).title;

  return (
    <div
      className={cn(
        "group flex min-w-0 items-center gap-3 px-3 py-2.5 transition-colors duration-150",
        "hover:bg-elevated/55 focus-within:bg-elevated/55",
        swapClass,
      )}
    >
      <ConfiguredModelRowContent model={model} isDefault={isDefault} />
      <div className="ml-auto flex shrink-0 items-center gap-0.5">
        <IconButton
          ariaLabel={copy.moveUp(modelTitle)}
          size="xs"
          disabled={!canMoveUp}
          onClick={onMoveUp}
          className="text-ink-muted/45 transition-colors group-hover:text-ink-muted group-focus-within:text-ink-muted hover:text-ink"
        >
          <ArrowUp size={11} weight="bold" />
        </IconButton>
        <IconButton
          ariaLabel={copy.moveDown(modelTitle)}
          size="xs"
          disabled={!canMoveDown}
          onClick={onMoveDown}
          className="text-ink-muted/45 transition-colors group-hover:text-ink-muted group-focus-within:text-ink-muted hover:text-ink"
        >
          <ArrowDown size={11} weight="bold" />
        </IconButton>
      </div>
    </div>
  );
}

function ConfiguredModelRowContent({
  model,
  isDefault,
  className,
}: {
  model: ManagedModelRecord;
  isDefault: boolean;
  className?: string;
}) {
  const copy = useCopy().settings.models;
  const display = modelDisplayParts(model);

  return (
    <div className={cn("min-w-0 flex-1", className)}>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div className="truncate text-[13px] font-medium text-ink">
          {display.title}
        </div>
        {isDefault && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-sm bg-brand-soft px-1.5 py-px text-[10.5px] text-brand-strong">
            <Star size={10} weight="fill" />
            {copy.defaultModel}
          </span>
        )}
        <span className="inline-flex shrink-0 rounded-sm border border-line bg-elevated px-1.5 py-px text-[10.5px] text-ink-muted">
          {model.providerDisplayName}
        </span>
      </div>
      {display.subtitle && (
        <div className="mt-0.5 truncate font-mono text-[11.5px] text-ink-muted">
          {display.subtitle}
        </div>
      )}
    </div>
  );
}

function ExternalRuntimeNotice() {
  const copy = useCopy().settings.models;
  return (
    <div className="flex gap-2 rounded-sm border border-brand/25 bg-brand-soft px-3 py-2.5 text-[12.5px] leading-[1.5] text-ink">
      <Info
        size={14}
        weight="bold"
        className="mt-0.5 shrink-0 text-brand-strong"
      />
      <div>{copy.externalNotice}</div>
    </div>
  );
}

function ProviderEditor({
  form,
  saving,
  canSave,
  canTest,
  canFetchModels,
  canCancel,
  providerHasSavedKey,
  probeState,
  modelOptions,
  onChange,
  onSelectProviderPreset,
  onTest,
  onFetchModels,
  onSave,
  onCancel,
}: {
  form: ProviderFormState;
  saving: boolean;
  canSave: boolean;
  canTest: boolean;
  canFetchModels: boolean;
  canCancel: boolean;
  providerHasSavedKey: boolean;
  probeState: ProbeState;
  modelOptions: string[];
  onChange: (patch: Partial<ProviderFormState>) => void;
  onSelectProviderPreset: (
    providerPresetId: ManagedModelProviderPresetId,
  ) => void;
  onTest: () => void;
  onFetchModels: () => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const copy = useCopy().settings.models;
  const isCreatingProvider = !form.id;
  const selectedPreset = getManagedModelProviderPreset(form.providerPresetId);
  const [moreOpen, setMoreOpen] = useState(false);
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const apiKeyRevealLabel = apiKeyVisible ? copy.hideApiKey : copy.showApiKey;

  return (
    <div className="rounded-sm border border-line bg-surface px-3 py-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[13px] font-medium text-ink">
            {isCreatingProvider ? copy.addProvider : copy.editProvider}
          </div>
          {form.id && providerHasSavedKey && (
            <div className="mt-0.5 text-[12px] text-ink-muted">
              {copy.leaveKeyBlank}
            </div>
          )}
        </div>
        {canCancel && (
          <IconButton
            ariaLabel={copy.closeProviderEditor}
            size="sm"
            onClick={onCancel}
          >
            <X size={12} weight="thin" />
          </IconButton>
        )}
      </div>

      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
            {copy.provider}
          </label>
          <ManagedModelProviderPicker
            value={form.providerPresetId}
            protocol={form.protocol}
            onChange={onSelectProviderPreset}
          />
        </div>

        <SettingsInput
          label={copy.apiKey}
          value={form.apiKey}
          onChange={(apiKey) => onChange({ apiKey })}
          type={apiKeyVisible ? "text" : "password"}
          placeholder={form.id ? copy.leaveExistingKey : "sk-..."}
          reserveTrailing
          trailing={
            form.apiKey.length > 0 ? (
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
        <SettingsInput
          label={copy.apiUrl}
          value={form.apiBase}
          onChange={(apiBase) => onChange({ apiBase })}
          placeholder={
            selectedPreset.apiBase ||
            (form.protocol === "openai"
              ? "https://api.openai.com/v1"
              : "https://api.anthropic.com")
          }
        />
        {isCreatingProvider && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[240px] flex-1">
                <SettingsInput
                  label={copy.model}
                  value={form.model}
                  onChange={(model) => onChange({ model })}
                  placeholder={selectedPreset.modelPlaceholder}
                />
              </div>
              <Button
                variant="accent-secondary"
                size="sm"
                disabled={!canFetchModels}
                onClick={onFetchModels}
                leadingIcon={
                  probeState.kind === "loading" &&
                  probeState.action === "model-list" ? (
                    <span className="spin">
                      <CircleNotch size={12} weight="thin" />
                    </span>
                  ) : (
                    <ListMagnifyingGlass size={12} weight="thin" />
                  )
                }
              >
                {copy.fetchList}
              </Button>
              <InlineProbeStatus state={probeState} action="model-list" />
            </div>
            <ProbeErrorLine state={probeState} action="model-list" />
            {modelOptions.length > 0 && (
              <select
                value={modelOptions.includes(form.model) ? form.model : ""}
                onChange={(e) => onChange({ model: e.target.value })}
                className="w-full rounded-sm border border-line bg-elevated px-3 py-2 font-mono text-[12.5px] text-ink outline-none transition-colors focus:border-brand focus:ring-[3px] focus:ring-brand/20"
              >
                <option value="">{copy.chooseDetectedModel}</option>
                {modelOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
        <div className="border-t border-line pt-2">
          <button
            type="button"
            onClick={() => setMoreOpen((open) => !open)}
            className="inline-flex items-center gap-1 rounded-sm px-0 py-1 text-[12px] text-ink-muted transition-colors hover:text-ink"
          >
            {moreOpen ? (
              <CaretDown size={11} weight="bold" />
            ) : (
              <CaretRight size={11} weight="bold" />
            )}
            {copy.moreOptions}
          </button>
          {moreOpen && (
            <div className="mt-2">
              <SettingsInput
                label={copy.providerName}
                value={form.displayName}
                onChange={(displayName) => onChange({ displayName })}
                placeholder={copy.providerNamePlaceholder}
              />
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={!canTest}
            onClick={onTest}
            leadingIcon={
              probeState.kind === "loading" &&
              probeState.action === "provider-test" ? (
                <span className="spin">
                  <CircleNotch size={12} weight="thin" />
                </span>
              ) : (
                <PlugsConnected size={12} weight="thin" />
              )
            }
          >
            {copy.testConnection}
          </Button>
          <InlineProbeStatus state={probeState} action="provider-test" />
          <Button
            variant="primary"
            size="sm"
            disabled={!canSave}
            onClick={onSave}
            leadingIcon={
              saving ? (
                <span className="spin">
                  <CircleNotch size={12} weight="thin" />
                </span>
              ) : (
                <Plus size={12} weight="bold" />
              )
            }
          >
            {form.id ? copy.saveService : copy.saveAndEnableModel}
          </Button>
        </div>
        <ProbeErrorLine state={probeState} action="provider-test" />
      </div>
    </div>
  );
}

function ProviderCard({
  provider,
  models,
  defaultModelId,
  allModelCount,
  saving,
  expanded,
  providerProbeState,
  modelProbeState,
  modelOptions,
  modelFilter,
  modelDraft,
  onToggle,
  onEditProvider,
  onDeleteProvider,
  onTestProvider,
  onFetchModels,
  onSetModelFilter,
  onStartModelDraft,
  onChangeModelDraft,
  onCancelModelDraft,
  onTestModelDraft,
  onSaveModelDraft,
  onEnableDetectedModel,
  onSetDefaultModel,
  onTestModel,
  modelProbeStateFor,
  onDeleteModel,
}: {
  provider: ManagedModelProviderRecord;
  models: ManagedModelRecord[];
  defaultModelId?: string;
  allModelCount: number;
  saving: boolean;
  expanded: boolean;
  providerProbeState: ProbeState;
  modelProbeState: ProbeState;
  modelOptions: string[];
  modelFilter: string;
  modelDraft: ModelDraftState | null;
  onToggle: () => void;
  onEditProvider: () => void;
  onDeleteProvider: () => void;
  onTestProvider: () => void;
  onFetchModels: () => void;
  onSetModelFilter: (value: string) => void;
  onStartModelDraft: (model?: ManagedModelRecord) => void;
  onChangeModelDraft: (patch: Partial<ModelDraftState>) => void;
  onCancelModelDraft: () => void;
  onTestModelDraft: (draft: ModelDraftState) => void;
  onSaveModelDraft: (draft: ModelDraftState) => void;
  onEnableDetectedModel: (modelName: string) => void;
  onSetDefaultModel: (model: ManagedModelRecord) => void;
  onTestModel: (model: ManagedModelRecord) => void;
  modelProbeStateFor: (modelId: string) => ProbeState;
  onDeleteModel: (model: ManagedModelRecord) => void;
}) {
  const copy = useCopy().settings.models;
  const keyMissing = provider.credentialStatus === "missing";
  const canUseProvider =
    !keyMissing && providerProbeState.kind !== "loading" && !saving;
  const canFetchModels =
    !keyMissing && modelProbeState.kind !== "loading" && !saving;
  const enabledModelNames = useMemo(
    () => new Set(models.map((item) => item.model)),
    [models],
  );
  const normalizedFilter = modelFilter.trim().toLowerCase();
  const filteredOptions = modelOptions.filter((option) =>
    option.toLowerCase().includes(normalizedFilter),
  );
  const visibleOptions = filteredOptions.slice(0, 80);

  return (
    <div>
      <div className="flex min-w-0 items-center gap-3 px-2 py-1.5">
        <button
          type="button"
          aria-expanded={expanded}
          className="group flex min-w-0 flex-1 items-center gap-3 rounded-sm px-2 py-1.5 text-left transition-colors hover:bg-elevated/70 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/20"
          onClick={onToggle}
        >
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-ink-muted transition-colors group-hover:bg-surface group-hover:text-ink">
            {expanded ? (
              <CaretDown size={12} weight="bold" />
            ) : (
              <CaretRight size={12} weight="bold" />
            )}
          </span>
          <Key size={16} weight="thin" className="shrink-0 text-ink-soft" />
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span
              className="min-w-0 truncate text-[13px] font-medium text-ink transition-colors group-hover:text-brand-strong"
              title={provider.displayName}
            >
              {provider.displayName}
            </span>
            <CredentialBadge status={provider.credentialStatus} />
            <span className="inline-flex shrink-0 rounded-sm border border-line bg-elevated px-1.5 py-px text-[10.5px] text-ink-muted">
              {copy.enabledModelsCount(models.length)}
            </span>
            <ProtocolBadge
              protocol={provider.protocol}
              apiBase={provider.apiBase}
            />
          </span>
        </button>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            disabled={!canUseProvider}
            onClick={onTestProvider}
            leadingIcon={
              providerProbeState.kind === "loading" &&
              providerProbeState.action === "provider-test" ? (
                <span className="spin">
                  <CircleNotch size={12} weight="thin" />
                </span>
              ) : (
                <PlugsConnected size={12} weight="thin" />
              )
            }
          >
            {copy.check}
          </Button>
          <InlineProbeStatus
            state={providerProbeState}
            action="provider-test"
          />
          <ProviderActionsMenu
            disabled={saving}
            onEdit={onEditProvider}
            onDelete={onDeleteProvider}
          />
        </div>
      </div>
      <ProbeErrorLine
        state={providerProbeState}
        action="provider-test"
        className="px-4 pb-3"
      />

      {expanded && (
        <div className="border-t border-line bg-elevated/40 px-3 py-3">
          <div className="space-y-3">
            {keyMissing && <ErrorLine message={copy.keyNeedsResave} />}

            {models.length > 0 ? (
              <div className="divide-y divide-line border-y border-line">
                {models.map((model) => (
                  <EnabledModelRow
                    key={model.id}
                    model={model}
                    isDefault={model.id === defaultModelId}
                    saving={saving}
                    keyMissing={keyMissing}
                    probeState={modelProbeStateFor(model.id)}
                    onEdit={() => onStartModelDraft(model)}
                    onSetDefault={() => onSetDefaultModel(model)}
                    onTest={() => onTestModel(model)}
                    onDelete={() => onDeleteModel(model)}
                  />
                ))}
              </div>
            ) : (
              <div className="border-y border-line py-3 text-[12.5px] text-ink-muted">
                {copy.noEnabledModels}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="accent-secondary"
                size="sm"
                disabled={!canFetchModels}
                onClick={onFetchModels}
                leadingIcon={
                  modelProbeState.kind === "loading" &&
                  modelProbeState.action === "model-list" ? (
                    <span className="spin">
                      <CircleNotch size={12} weight="thin" />
                    </span>
                  ) : (
                    <ListMagnifyingGlass size={12} weight="thin" />
                  )
                }
              >
                {copy.fetchModelList}
              </Button>
              <InlineProbeStatus state={modelProbeState} action="model-list" />
              <Button
                variant="secondary"
                size="sm"
                disabled={keyMissing || saving}
                onClick={() => onStartModelDraft()}
                leadingIcon={<Plus size={12} weight="bold" />}
              >
                {copy.addManually}
              </Button>
            </div>
            <ProbeErrorLine state={modelProbeState} action="model-list" />

            {modelOptions.length > 0 && (
              <div className="space-y-2 border-t border-line pt-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[12.5px] font-medium text-ink">
                    {copy.availableModels}
                  </div>
                  <div className="relative w-full max-w-[260px]">
                    <MagnifyingGlass
                      size={12}
                      weight="thin"
                      className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted"
                    />
                    <input
                      value={modelFilter}
                      onChange={(e) => onSetModelFilter(e.target.value)}
                      placeholder={copy.filterModels}
                      spellCheck={false}
                      className="w-full rounded-sm border border-line bg-surface py-1.5 pl-7 pr-2.5 text-[12px] text-ink outline-none transition-colors placeholder:text-ink-muted/70 focus:border-brand focus:ring-[3px] focus:ring-brand/20"
                    />
                  </div>
                </div>
                <div className="max-h-[260px] divide-y divide-line overflow-auto rounded-sm border border-line bg-surface">
                  {visibleOptions.length === 0 && (
                    <EmptyRow text={copy.noMatchingModels} />
                  )}
                  {visibleOptions.map((option) => (
                    <DetectedModelRow
                      key={option}
                      modelName={option}
                      enabled={enabledModelNames.has(option)}
                      saving={saving}
                      onEnable={() => onEnableDetectedModel(option)}
                    />
                  ))}
                </div>
                {filteredOptions.length > visibleOptions.length && (
                  <div className="text-[11.5px] text-ink-muted">
                    {copy.visibleOptionsHint(visibleOptions.length)}
                  </div>
                )}
              </div>
            )}

            {modelDraft && (
              <ModelDraftEditor
                draft={modelDraft}
                saving={saving}
                keyMissing={keyMissing}
                modelProbeState={modelProbeState}
                allModelCount={allModelCount}
                onChange={onChangeModelDraft}
                onCancel={onCancelModelDraft}
                onTest={() => onTestModelDraft(modelDraft)}
                onSave={() => onSaveModelDraft(modelDraft)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function EnabledModelRow({
  model,
  isDefault,
  saving,
  keyMissing,
  probeState,
  onEdit,
  onSetDefault,
  onTest,
  onDelete,
}: {
  model: ManagedModelRecord;
  isDefault: boolean;
  saving: boolean;
  keyMissing: boolean;
  probeState: ProbeState;
  onEdit: () => void;
  onSetDefault: () => void;
  onTest: () => void;
  onDelete: () => void;
}) {
  const copy = useCopy().settings.models;
  const display = modelDisplayParts(model);
  const testing =
    probeState.kind === "loading" && probeState.action === "model-test";

  return (
    <div className="py-2.5">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div className="min-w-[180px] flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="truncate text-[13px] font-medium text-ink">
              {display.title}
            </div>
          </div>
          {display.subtitle && (
            <div className="mt-0.5 truncate font-mono text-[11.5px] text-ink-muted">
              {display.subtitle}
            </div>
          )}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            disabled={keyMissing || saving || testing}
            onClick={onTest}
            leadingIcon={
              testing ? (
                <span className="spin">
                  <CircleNotch size={12} weight="thin" />
                </span>
              ) : (
                <PlugsConnected size={12} weight="thin" />
              )
            }
          >
            {copy.test}
          </Button>
          <InlineProbeStatus state={probeState} action="model-test" />
          {isDefault ? (
            <span className="inline-flex min-h-7 shrink-0 items-center gap-1 rounded-sm bg-brand-soft px-2 py-1 text-[11.5px] leading-none text-brand-strong">
              <Star size={11} weight="fill" />
              {copy.defaultModelStatus}
            </span>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              disabled={saving}
              onClick={onSetDefault}
              leadingIcon={<Star size={12} weight="thin" />}
            >
              {copy.setDefault}
            </Button>
          )}
          <IconButton ariaLabel={copy.editModel} size="sm" onClick={onEdit}>
            <PencilSimple size={13} weight="thin" />
          </IconButton>
          <IconButton
            ariaLabel={copy.removeModel}
            variant="danger"
            size="sm"
            disabled={saving}
            onClick={onDelete}
          >
            <Trash size={13} weight="thin" />
          </IconButton>
        </div>
      </div>
      <ProbeErrorLine state={probeState} action="model-test" />
    </div>
  );
}

function ProviderActionsMenu({
  disabled,
  onEdit,
  onDelete,
}: {
  disabled: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const appCopy = useCopy();
  const copy = appCopy.settings.models;
  const itemClass =
    "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 outline-none data-[highlighted]:bg-hover";

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <IconButton ariaLabel={appCopy.common.more} size="sm">
          <DotsThreeVertical size={13} weight="bold" />
        </IconButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className={cn(
            "z-[70] min-w-[112px] rounded-md border border-line bg-elevated p-1",
            "text-[13px] text-ink shadow-elevated",
          )}
        >
          <DropdownMenu.Item onSelect={onEdit} className={itemClass}>
            <PencilSimple size={13} weight="thin" />
            {copy.editProviderAction}
          </DropdownMenu.Item>
          <DropdownMenu.Item
            disabled={disabled}
            onSelect={onDelete}
            className={cn(
              itemClass,
              "text-error data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
            )}
          >
            <Trash size={13} weight="thin" />
            {copy.deleteProviderAction}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function DetectedModelRow({
  modelName,
  enabled,
  saving,
  onEnable,
}: {
  modelName: string;
  enabled: boolean;
  saving: boolean;
  onEnable: () => void;
}) {
  const copy = useCopy().settings.models;
  return (
    <div className="flex min-w-0 items-center gap-3 px-3 py-2">
      <div className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink">
        {modelName}
      </div>
      {enabled ? (
        <span className="inline-flex shrink-0 items-center gap-1 text-[11.5px] text-success">
          <CheckCircle size={11} weight="fill" />
          {copy.enabled}
        </span>
      ) : (
        <Button
          variant="secondary"
          size="sm"
          disabled={saving}
          onClick={onEnable}
          leadingIcon={<Plus size={12} weight="bold" />}
        >
          {copy.enable}
        </Button>
      )}
    </div>
  );
}

function ModelDraftEditor({
  draft,
  saving,
  keyMissing,
  modelProbeState,
  allModelCount,
  onChange,
  onCancel,
  onTest,
  onSave,
}: {
  draft: ModelDraftState;
  saving: boolean;
  keyMissing: boolean;
  modelProbeState: ProbeState;
  allModelCount: number;
  onChange: (patch: Partial<ModelDraftState>) => void;
  onCancel: () => void;
  onTest: () => void;
  onSave: () => void;
}) {
  const appCopy = useCopy();
  const copy = appCopy.settings.models;
  const canTest =
    !keyMissing &&
    draft.model.trim() !== "" &&
    modelProbeState.kind !== "loading";
  const canSave = !keyMissing && draft.model.trim() !== "" && !saving;

  return (
    <div className="space-y-3 border-t border-line pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[12.5px] font-medium text-ink">
            {draft.id ? copy.editModel : copy.manualAddModel}
          </div>
          {!draft.id && allModelCount === 0 && (
            <div className="mt-0.5 text-[12px] text-ink-muted">
              {copy.autoDefaultHint}
            </div>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          {appCopy.common.cancel}
        </Button>
      </div>
      <SettingsInput
        label={copy.modelName}
        value={draft.model}
        onChange={(model) => onChange({ model })}
        placeholder={copy.modelNamePlaceholder}
      />
      <SettingsInput
        label={copy.displayName}
        value={draft.displayName}
        onChange={(displayName) => onChange({ displayName })}
        placeholder={copy.displayNamePlaceholder}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={!canTest}
          onClick={onTest}
          leadingIcon={
            modelProbeState.kind === "loading" &&
            modelProbeState.action === "model-test" ? (
              <span className="spin">
                <CircleNotch size={12} weight="thin" />
              </span>
            ) : (
              <PlugsConnected size={12} weight="thin" />
            )
          }
        >
          {copy.testModel}
        </Button>
        <InlineProbeStatus state={modelProbeState} action="model-test" />
        <Button
          variant="primary"
          size="sm"
          disabled={!canSave}
          onClick={onSave}
          leadingIcon={
            saving ? (
              <span className="spin">
                <CircleNotch size={12} weight="thin" />
              </span>
            ) : (
              <Plus size={12} weight="bold" />
            )
          }
        >
          {draft.id ? copy.saveModel : copy.enableModel}
        </Button>
      </div>
      <ProbeErrorLine state={modelProbeState} action="model-test" />
    </div>
  );
}

function SettingsInput({
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
            "w-full rounded-sm border border-line bg-surface px-3 py-2 font-mono text-[12.5px] text-ink outline-none transition-colors placeholder:text-ink-muted/70 focus:border-brand focus:ring-[3px] focus:ring-brand/20",
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

function InlineProbeStatus({
  state,
  action,
}: {
  state: ProbeState;
  action: ProbeAction;
}) {
  if (state.kind !== "success" || state.action !== action) return null;
  return (
    <span
      className="inline-flex min-h-7 max-w-[220px] shrink items-center gap-1 px-1 text-[11.5px] leading-none text-success"
      title={state.message}
    >
      <CheckCircle size={11} weight="fill" className="shrink-0" />
      <span className="truncate">{state.message}</span>
    </span>
  );
}

function ProbeErrorLine({
  state,
  action,
  className,
}: {
  state: ProbeState;
  action: ProbeAction;
  className?: string;
}) {
  if (state.kind !== "error" || state.action !== action) return null;
  return (
    <div className={cn("mt-2", className)}>
      <StatusLine state={state} />
    </div>
  );
}

function StatusLine({ state }: { state: ProbeState }) {
  if (state.kind !== "success" && state.kind !== "error") return null;
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-sm border px-3 py-2 text-[12.5px]",
        state.kind === "success"
          ? "border-success/20 bg-success/[0.06] text-success"
          : "border-error/20 bg-error/[0.06] text-error",
      )}
    >
      {state.kind === "success" ? (
        <CheckCircle size={12} weight="fill" />
      ) : (
        <WarningCircle size={12} weight="fill" />
      )}
      {state.message}
    </div>
  );
}

function ErrorLine({ message }: { message: string }) {
  return (
    <div className="rounded-sm border border-error/20 bg-error/[0.06] px-3 py-2 text-[12.5px] text-error">
      {message}
    </div>
  );
}

function LoadingRow() {
  const copy = useCopy().settings.models;
  return (
    <div className="flex items-center gap-2 px-3 py-3 text-[12.5px] text-ink-muted">
      <span className="spin">
        <CircleNotch size={13} weight="thin" />
      </span>
      {copy.loading}
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <div className="px-3 py-3 text-[12.5px] text-ink-muted">{text}</div>;
}

function CredentialBadge({
  status,
}: {
  status: "present" | "missing" | "unknown";
}) {
  const copy = useCopy().settings.models;
  if (status === "present") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-sm bg-success/10 px-1.5 py-px text-[10.5px] text-success">
        <CheckCircle size={10} weight="fill" />
        {copy.keyVerified}
      </span>
    );
  }
  if (status === "unknown") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-sm bg-ink-muted/10 px-1.5 py-px text-[10.5px] text-ink-muted">
        <Key size={10} weight="fill" />
        {copy.keySaved}
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-sm bg-warning/10 px-1.5 py-px text-[10.5px] text-warning">
      <WarningCircle size={10} weight="fill" />
      {copy.keyNeedsResaveShort}
    </span>
  );
}

function ProtocolBadge({
  protocol,
  apiBase,
}: {
  protocol: ManagedModelProtocol;
  apiBase: string;
}) {
  const label = protocolLabel(protocol);
  return (
    <span
      className="inline-flex shrink-0 rounded-sm border border-line bg-surface/70 px-1.5 py-px font-mono text-[10.5px] text-ink-muted"
      title={`${label} · ${apiBase}`}
    >
      {label}
    </span>
  );
}

function modelDisplayParts(model: ManagedModelRecord): {
  title: string;
  subtitle?: string;
} {
  const modelName = model.model.trim();
  const displayName = model.displayName.trim();
  if (displayName !== "" && displayName !== modelName) {
    return { title: displayName, subtitle: modelName };
  }
  return { title: modelName || model.displayName };
}

function normalizedModelDisplayName(draft: ModelDraftState): string {
  const displayName = draft.displayName.trim();
  if (displayName === "" || displayName === draft.model.trim()) {
    return "";
  }
  return displayName;
}

function applyModelOrder(
  models: ManagedModelRecord[],
  orderedIds: string[] | null,
): ManagedModelRecord[] {
  if (!orderedIds) return models;
  const modelById = new Map(models.map((model) => [model.id, model]));
  const ordered = orderedIds
    .map((id) => modelById.get(id))
    .filter((model): model is ManagedModelRecord => Boolean(model));
  const orderedIdSet = new Set(orderedIds);
  const remaining = models.filter((model) => !orderedIdSet.has(model.id));
  if (ordered.length === 0) return models;
  return [...ordered, ...remaining];
}

function modelSwapAnimationClass(
  modelId: string,
  feedback: ModelMoveFeedbackState | null,
): string | undefined {
  if (!feedback) return undefined;
  if (modelId === feedback.movedId) {
    return feedback.direction === "up"
      ? "model-row-swap-up"
      : "model-row-swap-down";
  }
  if (modelId === feedback.swappedId) {
    return feedback.direction === "up"
      ? "model-row-swap-down"
      : "model-row-swap-up";
  }
  return undefined;
}

function protocolLabel(protocol: ManagedModelProtocol): string {
  return managedModelProtocolLabel(protocol);
}

function connectionSuccessMessage(
  result: TimedManagedModelConnectionResult,
  context: "provider" | "setup-model" | "saved-model",
  copy: ReturnType<typeof useCopy>["settings"]["models"],
): string {
  const message =
    context === "provider"
      ? copy.connectionUsable
      : context === "saved-model"
        ? copy.modelUsable
        : result.modelFound === true
          ? copy.modelUsable
          : copy.connectionUsableCanSave;
  return copy.connectionLatency(message, result.latencyMs);
}
