import { Info } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";

import {
  SettingsPanelHeader,
  SettingsSectionLabel,
} from "@/components/screens/settings/settings-ui";
import {
  listManagedModelOptions,
  managedModelProbeErrorMessage,
  testManagedModelConnectionWithLatency,
} from "@/lib/managed-models";
import { useCopy } from "@/lib/i18n";
import { makeAppError } from "@/types/app-error";
import {
  advancedOptionsForManagedModelProvider,
  customManagedModelProviderPresetId,
  recommendedAdvancedOptionsForManagedModelProvider,
  type ManagedModelProviderPresetId,
} from "@/lib/managed-model-presets";
import { useManagedModelsStore } from "@/stores/managed-models";
import { useUiStore } from "@/stores/ui";
import type {
  ManagedModelProviderRecord,
  ManagedModelRecord,
} from "@/types/managed-models";
import type { RuntimeKind } from "@/types/session";
import {
  applyModelOrder,
  connectionSuccessMessage,
  modelDisplayParts,
  newProviderForm,
  normalizedModelDisplayName,
  providerFormFromPreset,
} from "./models/model-settings-utils";
import {
  probeStateFor,
  withProbeState,
  withoutProbeState,
} from "./models/probe-state";
import {
  EmptyRow,
  ErrorLine,
  LoadingRow,
} from "./models/ModelPrimitives";
import { ConfiguredModelsPanel } from "./models/ConfiguredModelsPanel";
import { ProviderEditor } from "./models/ProviderEditor";
import { ProviderCard } from "./models/ProviderCard";
import type {
  ModelDraftState,
  ModelMoveDirection,
  ModelMoveFeedbackState,
  ProbeState,
  ProbeStateMap,
  ProviderFormState,
} from "./models/types";

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
  const [providerProbeStates, setProviderProbeStates] = useState<ProbeStateMap>(
    {},
  );
  const [modelProbeStates, setModelProbeStates] = useState<ProbeStateMap>({});
  const [savedModelProbeStates, setSavedModelProbeStates] =
    useState<ProbeStateMap>({});
  const [modelOptionsByProvider, setModelOptionsByProvider] = useState<
    Record<string, string[]>
  >({});
  const [providerFormModelOptions, setProviderFormModelOptions] = useState<
    string[]
  >([]);
  const [providerFormModelFilter, setProviderFormModelFilter] = useState("");
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
  const providerFormIsInlineEdit = !!visibleProviderForm?.id;
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

  const showModelConfigSavedToast = (
    message = copy.toasts.modelConfigSavedMessage,
  ) => {
    useUiStore.getState().pushToast(
      makeAppError({
        id: "managed-model-config-saved",
        category: "business",
        severity: "info",
        title: copy.toasts.modelConfigSaved,
        message,
        hint: null,
        retryable: false,
        context: "save_managed_model_config",
        traceback: null,
        autoDismissMs: 4200,
      }),
    );
  };

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
      setProviderFormModelFilter("");
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
    setProviderFormModelFilter("");
    setProviderFormProbeState({ kind: "idle" });
  };

  const resetProviderForm = () => {
    setProviderForm(null);
    setProviderFormModelOptions([]);
    setProviderFormModelFilter("");
    setProviderFormProbeState({ kind: "idle" });
  };

  const resetModelDraft = () => {
    const providerId = modelDraft?.providerId;
    setModelDraft(null);
    if (providerId) {
      setModelProbeStates((current) => withoutProbeState(current, providerId));
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
        if (providerFormModelOptions.length > 0) {
          setModelOptionsByProvider((current) => ({
            ...current,
            [saved.id]: providerFormModelOptions,
          }));
          setModelFilterByProvider((current) => ({
            ...current,
            [saved.id]: providerFormModelFilter,
          }));
        }
      }
      setProviderProbeStates((current) => withoutProbeState(current, saved.id));
      setModelProbeStates((current) => withoutProbeState(current, saved.id));
      expandProvider(saved.id);
      resetProviderForm();
      showModelConfigSavedToast(
        isNewProvider
          ? modelCopy.providerCreatedToastMessage
          : copy.toasts.modelConfigSavedMessage,
      );
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
        const recommendedAdvancedOptions =
          recommendedAdvancedOptionsForManagedModelProvider(provider);
        setModelDraft({
          providerId: provider.id,
          model: "",
          displayName: "",
          advancedOptions: recommendedAdvancedOptions,
          recommendedAdvancedOptions,
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
      const recommendedAdvancedOptions =
        recommendedAdvancedOptionsForManagedModelProvider(provider);
      if (modelDraft?.providerId !== provider.id) {
        setModelDraft({
          providerId: provider.id,
          model: "",
          displayName: "",
          advancedOptions: recommendedAdvancedOptions,
          recommendedAdvancedOptions,
        });
      }
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
    try {
      await saveModel({
        id: draft.id,
        providerId: draft.providerId,
        model: draft.model,
        displayName: normalizedModelDisplayName(draft),
        advancedOptions: draft.advancedOptions,
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
      showModelConfigSavedToast();
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
      showModelConfigSavedToast();
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
      showModelConfigSavedToast();
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
      showModelConfigSavedToast();
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
          setProviderFormModelFilter("");
          setProviderFormProbeState({ kind: "idle" });
        }}
      />

      {visibleProviderForm && !providerFormIsInlineEdit && (
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
          modelFilter={providerFormModelFilter}
          onChange={updateProviderForm}
          onSetModelFilter={setProviderFormModelFilter}
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
                modelProbeState={probeStateFor(modelProbeStates, provider.id)}
                modelOptions={modelOptionsByProvider[provider.id] ?? []}
                modelFilter={modelFilterByProvider[provider.id] ?? ""}
                modelDraft={
                  modelDraft?.providerId === provider.id ? modelDraft : null
                }
                providerEditor={
                  visibleProviderForm?.id === provider.id ? (
                    <ProviderEditor
                      form={visibleProviderForm}
                      saving={saving}
                      canSave={canSaveProvider}
                      canTest={canTestProvider}
                      canFetchModels={canFetchProviderFormModels}
                      canCancel={
                        providers.length > 0 || !!visibleProviderForm.id
                      }
                      providerHasSavedKey={providerHasSavedKey}
                      probeState={providerFormProbeState}
                      modelOptions={providerFormModelOptions}
                      modelFilter={providerFormModelFilter}
                      onChange={updateProviderForm}
                      onSetModelFilter={setProviderFormModelFilter}
                      onSelectProviderPreset={selectProviderPreset}
                      onTest={() => void handleProviderFormTest()}
                      onFetchModels={() => void handleProviderFormFetchModels()}
                      onSave={() => void handleProviderSave()}
                      onCancel={resetProviderForm}
                      className="border-brand/30 bg-elevated/65"
                    />
                  ) : null
                }
                onToggle={() => toggleProvider(provider.id)}
                onEditProvider={() => {
                  expandProvider(provider.id);
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
                          advancedOptions: model.advancedOptions,
                          recommendedAdvancedOptions:
                            recommendedAdvancedOptionsForManagedModelProvider(
                              provider,
                            ),
                        }
                      : {
                          providerId: provider.id,
                          model: "",
                          displayName: "",
                          advancedOptions:
                            recommendedAdvancedOptionsForManagedModelProvider(
                              provider,
                            ),
                          recommendedAdvancedOptions:
                            recommendedAdvancedOptionsForManagedModelProvider(
                              provider,
                            ),
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
