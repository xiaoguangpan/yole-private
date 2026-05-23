export type ManagedModelProtocol = "anthropic" | "openai";

export type ManagedModelCredentialStatus = "present" | "missing" | "unknown";

export interface ManagedModelRecord {
  id: string;
  displayName: string;
  protocol: ManagedModelProtocol;
  apiBase: string;
  model: string;
  apiKeyRef: string;
  advancedOptions: Record<string, unknown>;
  isDefault: boolean;
  credentialStatus: ManagedModelCredentialStatus;
  lastValidatedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SaveManagedModelInput {
  id?: string;
  displayName?: string;
  protocol: ManagedModelProtocol;
  apiBase: string;
  model: string;
  apiKey?: string;
  makeDefault?: boolean;
}
