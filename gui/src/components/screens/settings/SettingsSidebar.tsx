import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  CaretDown,
  Check,
  Cpu,
  Info,
  Keyboard,
  Key,
  PlugsConnected,
  ShieldCheck,
  Translate,
} from "@phosphor-icons/react";

import { useCopy } from "@/lib/i18n";
import {
  isChineseLanguage,
  type LanguagePreference,
  type ResolvedLanguage,
} from "@/lib/language";
import { cn } from "@/lib/utils";

import type { SettingsTab } from "./settings-types";

export function SettingsSidebar({
  tab,
  onChange,
  languagePreference,
  resolvedLanguage,
  onChangeLanguagePreference,
}: {
  tab: SettingsTab;
  onChange: (tab: SettingsTab) => void;
  languagePreference: LanguagePreference;
  resolvedLanguage: ResolvedLanguage;
  onChangeLanguagePreference: (preference: LanguagePreference) => void;
}) {
  const copy = useCopy();
  const showChineseHelpers = isChineseLanguage(resolvedLanguage);
  const tabCopy = copy.settings.tabs;
  return (
    <nav className="flex w-[180px] shrink-0 flex-col border-r border-line bg-app py-3">
      <div>
        <SettingsTabButton
          active={tab === "runtime"}
          Icon={Cpu}
          label={tabCopy.runtime.label}
          subLabel={showChineseHelpers ? tabCopy.runtime.helper : undefined}
          onClick={() => onChange("runtime")}
        />
        <SettingsTabButton
          active={tab === "models"}
          Icon={Key}
          label={tabCopy.models.label}
          subLabel={showChineseHelpers ? tabCopy.models.helper : undefined}
          onClick={() => onChange("models")}
        />
        <SettingsTabButton
          active={tab === "approval"}
          Icon={ShieldCheck}
          label={tabCopy.approval.label}
          subLabel={showChineseHelpers ? tabCopy.approval.helper : undefined}
          onClick={() => onChange("approval")}
        />
        <SettingsTabButton
          active={tab === "integration"}
          Icon={PlugsConnected}
          label={tabCopy.agent.label}
          subLabel={showChineseHelpers ? tabCopy.agent.helper : undefined}
          onClick={() => onChange("integration")}
        />
        <SettingsTabButton
          active={tab === "shortcuts"}
          Icon={Keyboard}
          label={tabCopy.shortcuts.label}
          subLabel={showChineseHelpers ? tabCopy.shortcuts.helper : undefined}
          onClick={() => onChange("shortcuts")}
        />
        <SettingsTabButton
          active={tab === "about"}
          Icon={Info}
          label={tabCopy.about.label}
          subLabel={showChineseHelpers ? tabCopy.about.helper : undefined}
          onClick={() => onChange("about")}
        />
      </div>
      <div className="mt-auto border-t border-line/70 px-2 pt-2">
        <LanguagePreferenceMenu
          preference={languagePreference}
          resolvedLanguage={resolvedLanguage}
          onChange={onChangeLanguagePreference}
        />
      </div>
    </nav>
  );
}

function SettingsTabButton({
  active,
  Icon,
  label,
  subLabel,
  onClick,
}: {
  active: boolean;
  Icon: typeof Cpu;
  label: string;
  subLabel?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex w-full items-center gap-3 px-4 text-left transition-colors",
        subLabel ? "h-[50px]" : "h-8 text-[13px]",
        active ? "bg-hover" : "hover:bg-hover",
      )}
    >
      {active && (
        <span
          className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r bg-ink"
          aria-hidden
        />
      )}
      <Icon
        size={16}
        weight="thin"
        className={cn(
          "shrink-0",
          active ? "text-ink" : "text-ink-soft group-hover:text-ink",
        )}
      />
      <span className="flex min-w-0 flex-col justify-center">
        <span
          className={cn(
            "block truncate text-[14px] font-medium leading-[18px]",
            active ? "text-ink" : "text-ink-soft group-hover:text-ink",
          )}
        >
          {label}
        </span>
        {subLabel && (
          <span
            className={cn(
              "mt-1 block truncate text-[10.5px] font-normal leading-[11px]",
              active ? "text-ink-muted" : "text-ink-muted/75",
            )}
          >
            {subLabel}
          </span>
        )}
      </span>
    </button>
  );
}

function LanguagePreferenceMenu({
  preference,
  resolvedLanguage,
  onChange,
}: {
  preference: LanguagePreference;
  resolvedLanguage: ResolvedLanguage;
  onChange: (preference: LanguagePreference) => void;
}) {
  const copy = useCopy();
  const isChinese = isChineseLanguage(resolvedLanguage);
  const options: Array<{
    value: LanguagePreference;
    label: string;
    subLabel?: string;
  }> = isChinese
    ? [
        {
          value: "system",
          label: copy.language.system,
          subLabel: copy.language.systemHelper,
        },
        { value: "zh-CN", label: copy.language.zh },
        { value: "en-US", label: copy.language.en },
      ]
    : [
        {
          value: "system",
          label: copy.language.system,
          subLabel: copy.language.systemHelper,
        },
        { value: "zh-CN", label: copy.language.zh },
        { value: "en-US", label: copy.language.en },
      ];
  const current = options.find((option) => option.value === preference);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={cn(
            "flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left transition-colors",
            "text-ink-soft outline-none hover:bg-hover hover:text-ink",
            "data-[state=open]:bg-hover data-[state=open]:text-ink",
          )}
          aria-label={copy.language.aria}
        >
          <Translate size={15} weight="thin" className="shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] leading-4">
              {copy.language.button}
            </span>
            <span className="block truncate text-[11px] leading-3 text-ink-muted">
              {current?.label ?? "Auto"}
            </span>
          </span>
          <CaretDown size={11} weight="bold" className="shrink-0" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          side="right"
          sideOffset={8}
          className={cn(
            "z-[70] min-w-[160px] rounded-md border border-line bg-elevated p-1",
            "text-[13px] text-ink shadow-elevated",
          )}
        >
          {options.map((option) => (
            <DropdownMenu.Item
              key={option.value}
              onSelect={() => onChange(option.value)}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 outline-none",
                "data-[highlighted]:bg-hover",
              )}
            >
              <span className="flex size-3.5 shrink-0 items-center justify-center">
                {option.value === preference && (
                  <Check
                    size={12}
                    weight="bold"
                    className="text-brand-strong"
                  />
                )}
              </span>
              <span className="min-w-0">
                <span className="block truncate">{option.label}</span>
                {option.subLabel && (
                  <span className="block truncate text-[11px] text-ink-muted">
                    {option.subLabel}
                  </span>
                )}
              </span>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
