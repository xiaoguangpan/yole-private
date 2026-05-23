import { invoke } from "@tauri-apps/api/core";

import type {
  ManagedModelRecord,
  SaveManagedModelInput,
} from "@/types/managed-models";

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
