import { invoke } from "@tauri-apps/api/core";

import type {
  ManagedModelConnectionResult,
  ManagedModelListResult,
  ManagedModelProbeInput,
  ManagedModelProviderRecord,
  ManagedModelRecord,
  ReorderManagedModelsInput,
  SaveManagedModelInput,
  SaveManagedProviderInput,
} from "@/types/managed-models";

export async function listManagedModelProviders(): Promise<
  ManagedModelProviderRecord[]
> {
  return invoke<ManagedModelProviderRecord[]>("list_managed_model_providers");
}

export async function saveManagedModelProvider(
  input: SaveManagedProviderInput,
): Promise<ManagedModelProviderRecord> {
  return invoke<ManagedModelProviderRecord>("save_managed_model_provider", {
    input,
  });
}

export async function deleteManagedModelProvider(id: string): Promise<void> {
  await invoke("delete_managed_model_provider", { id });
}

export async function listManagedModels(): Promise<ManagedModelRecord[]> {
  return invoke<ManagedModelRecord[]>("list_managed_models");
}

export async function saveManagedModel(
  input: SaveManagedModelInput,
): Promise<ManagedModelRecord> {
  return invoke<ManagedModelRecord>("save_managed_model", { input });
}

export async function deleteManagedModel(id: string): Promise<void> {
  await invoke("delete_managed_model", { id });
}

export async function reorderManagedModels(
  input: ReorderManagedModelsInput,
): Promise<void> {
  await invoke("reorder_managed_models", { input });
}

export async function listManagedModelOptions(
  input: ManagedModelProbeInput,
): Promise<ManagedModelListResult> {
  return invoke<ManagedModelListResult>("list_managed_model_options", {
    input,
  });
}

export async function testManagedModelConnection(
  input: ManagedModelProbeInput,
): Promise<ManagedModelConnectionResult> {
  return invoke<ManagedModelConnectionResult>(
    "test_managed_model_connection",
    { input },
  );
}

export interface TimedManagedModelConnectionResult
  extends ManagedModelConnectionResult {
  latencyMs: number;
}

export async function testManagedModelConnectionWithLatency(
  input: ManagedModelProbeInput,
): Promise<TimedManagedModelConnectionResult> {
  const start = nowMs();
  const result = await testManagedModelConnection(input);
  return {
    ...result,
    latencyMs: Math.max(0, Math.round(nowMs() - start)),
  };
}

type ManagedModelProbeErrorCopy = {
  actionFailed: string;
  errorUnauthorized: string;
  errorForbidden: string;
  errorRateLimited: string;
  errorNotFound: string;
  errorServer: (status: number) => string;
  errorTimeout: string;
  errorNetwork: string;
  errorUnknownWithDetail: (detail: string) => string;
};

export function managedModelProbeErrorMessage(
  error: unknown,
  copy: ManagedModelProbeErrorCopy,
): string {
  const detail = extractErrorMessage(error);
  const status = extractHttpStatus(detail);
  if (status === 401) return copy.errorUnauthorized;
  if (status === 403) return copy.errorForbidden;
  if (status === 404) return copy.errorNotFound;
  if (status === 429) return copy.errorRateLimited;
  if (status && status >= 500) return copy.errorServer(status);

  const normalized = detail.toLowerCase();
  if (
    normalized.includes("timed out") ||
    normalized.includes("timeout") ||
    normalized.includes("deadline")
  ) {
    return copy.errorTimeout;
  }
  if (
    normalized.includes("network") ||
    normalized.includes("dns") ||
    normalized.includes("failed to lookup") ||
    normalized.includes("connection refused") ||
    normalized.includes("connection reset") ||
    normalized.includes("error sending request") ||
    normalized.includes("request failed")
  ) {
    return copy.errorNetwork;
  }

  return detail ? copy.errorUnknownWithDetail(detail) : copy.actionFailed;
}

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function extractErrorMessage(error: unknown): string {
  if (typeof error === "string") {
    try {
      const parsed = JSON.parse(error) as { message?: unknown };
      return typeof parsed.message === "string" ? parsed.message : error;
    } catch {
      return error;
    }
  }
  if (error instanceof Error) return error.message;
  return "";
}

function extractHttpStatus(message: string): number | undefined {
  const match = message.match(/\bHTTP\s+(\d{3})\b/i);
  if (!match) return undefined;
  const status = Number(match[1]);
  return Number.isFinite(status) ? status : undefined;
}
