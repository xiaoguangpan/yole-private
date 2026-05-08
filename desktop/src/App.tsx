import {
  CircleNotch,
  Cube,
  MagnifyingGlass,
  Plus,
  ShieldCheck,
} from "@phosphor-icons/react";

import { AppShell } from "@/components/layout/AppShell";

/**
 * Stage 2 #1 verification page.
 *
 * Renders the three-pane shell with placeholder content + a token check
 * panel so we can confirm at a glance: fonts loaded, color tokens
 * mapped, Phosphor icons render, shadows / radii correct.
 *
 * Real components land in #2-#7.
 */
function App() {
  return (
    <AppShell
      sidebar={<SidebarPlaceholder />}
      main={<MainPlaceholder />}
      inspector={<InspectorPlaceholder />}
    />
  );
}

function SidebarPlaceholder() {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line px-4 py-4">
        <div className="font-serif text-base font-medium text-ink">
          GA Workbench
        </div>
        <div className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-ink-soft">
          <span className="size-2 rounded-full bg-success ring-2 ring-success/20" />
          <span>Runtime · placeholder</span>
        </div>
      </div>
      <div className="border-b border-line py-1.5">
        <SidebarItem icon={<Plus size={14} />} label="New Chat" hint="⌘N" />
        <SidebarItem
          icon={<MagnifyingGlass size={14} />}
          label="Search"
          hint="⌘K"
        />
      </div>
      <div className="flex-1 px-5 py-6 text-[12.5px] italic text-ink-muted">
        Sessions placeholder · #2 实现
      </div>
    </div>
  );
}

function SidebarItem({
  icon,
  label,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
}) {
  return (
    <div className="mx-1.5 flex cursor-pointer items-center gap-2.5 rounded-sm px-3 py-2 text-[13px] hover:bg-hover">
      <span className="text-ink-soft">{icon}</span>
      <span>{label}</span>
      {hint && (
        <span className="ml-auto text-[11px] text-ink-muted">{hint}</span>
      )}
    </div>
  );
}

function MainPlaceholder() {
  return (
    <div className="flex h-full flex-col">
      <TopBarPlaceholder />
      <div className="flex-1 overflow-auto px-8 py-8">
        <div className="mx-auto max-w-[760px] space-y-10">
          <Hero />
          <TokenCheckPanel />
          <FontCheckPanel />
          <IconCheckPanel />
        </div>
      </div>
    </div>
  );
}

function TopBarPlaceholder() {
  // titleBarStyle: "Overlay" leaves the traffic light floating at
  // {x: 16, y: 16}. We reserve 70px of left padding so our top bar
  // chrome doesn't sit under those buttons.
  return (
    <div className="flex h-11 shrink-0 items-center border-b border-line pl-[70px] pr-4 text-[13px] text-ink-soft">
      <span className="font-medium text-ink">Stage 2 · #1 骨架验证</span>
    </div>
  );
}

function InspectorPlaceholder() {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line px-4 py-3 text-[12.5px] font-medium text-ink-soft">
        Inspector
      </div>
      <div className="flex-1 px-4 py-6 text-[12.5px] italic text-ink-muted">
        三个 tab 在 #4 实现
      </div>
    </div>
  );
}

function Hero() {
  return (
    <div className="space-y-2">
      <h1 className="font-serif text-[32px] font-medium leading-tight tracking-tight">
        Hello, GA Workbench
      </h1>
      <p className="font-serif text-[16.5px] italic leading-relaxed text-ink-soft">
        Stage 2 #1 — toolchain + design tokens 已就位。下面是 token 校验，
        每一项都要看起来"对"才算这一步过。
      </p>
    </div>
  );
}

function TokenCheckPanel() {
  const swatches: Array<[string, string, string]> = [
    ["bg-app", "#FAF7F2", "App background 暖米白"],
    ["bg-surface", "#FDFAF5", "普通卡片底"],
    ["bg-elevated", "#FFFFFF", "浮起卡片 (Health Check / Error / Palette)"],
    ["bg-hover", "#F2EDE3", "中性灰 hover"],
    ["bg-selected", "#F8EDDA", "杏沙 tint (品牌时刻)"],
    ["bg-brand", "#D9A78A", "杏沙 (体温色，Submit / focus ring)"],
    ["bg-brand-soft", "#F8EDDA", "杏沙最浅"],
    ["bg-brand-strong", "#C68762", "杏沙 hover/active"],
    ["bg-success", "#5A8C5A", "成功"],
    ["bg-warning", "#BF7A1F", "深琥珀 warning"],
    ["bg-error", "#B14545", "深红 error"],
    ["bg-info", "#7A7A8E", "muted 灰蓝 info"],
  ];

  return (
    <Section title="色板 Tokens">
      <div className="grid grid-cols-2 gap-2">
        {swatches.map(([cls, hex, label]) => (
          <div
            key={cls}
            className="flex items-center gap-3 rounded-md border border-line bg-surface p-2.5"
          >
            <span
              className={`size-9 shrink-0 rounded-sm border border-line-subtle ${cls}`}
            />
            <div className="min-w-0 flex-1">
              <div className="font-mono text-[11.5px] text-ink">{cls}</div>
              <div className="font-mono text-[10.5px] text-ink-muted">
                {hex}
              </div>
              <div className="mt-0.5 text-[11px] text-ink-soft">{label}</div>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function FontCheckPanel() {
  return (
    <Section title="字体 Registers (方案 C)">
      <div className="space-y-3">
        <div className="rounded-md border border-line bg-surface p-4">
          <div className="text-[11px] uppercase tracking-wider text-ink-muted">
            font-serif · Newsreader / 思源宋体
          </div>
          <div className="mt-1.5 font-serif text-[16.5px] leading-relaxed">
            被读的内容用衬线 — assistant 回复、turn summary、文档化的对话
            正文。"在文档工作区里跟一个温和但严肃的助手协作"。
          </div>
        </div>
        <div className="rounded-md border border-line bg-surface p-4">
          <div className="text-[11px] uppercase tracking-wider text-ink-muted">
            font-sans · Inter / 苹方 / 思源黑体
          </div>
          <div className="mt-1.5 font-sans text-[14px] font-medium">
            被点的元素用无衬线 — 按钮、菜单、metadata、session row。
          </div>
        </div>
        <div className="rounded-md border border-line bg-surface p-4">
          <div className="text-[11px] uppercase tracking-wider text-ink-muted">
            font-mono · JetBrains Mono / SF Mono
          </div>
          <div className="mt-1.5 font-mono text-[12.5px]">
            $ pnpm tauri dev{" "}
            <span className="text-ink-muted">// 技术 ID 用等宽</span>
          </div>
        </div>
      </div>
    </Section>
  );
}

function IconCheckPanel() {
  return (
    <Section title="Phosphor Thin Icons">
      <div className="flex flex-wrap items-center gap-4 rounded-md border border-line bg-surface p-4">
        <IconWell label="ShieldCheck">
          <ShieldCheck size={20} weight="thin" className="text-ink" />
        </IconWell>
        <IconWell label="CircleNotch · spin">
          <span className="spin">
            <CircleNotch
              size={20}
              weight="thin"
              className="text-brand-strong"
            />
          </span>
        </IconWell>
        <IconWell label="Cube">
          <Cube size={20} weight="thin" className="text-ink-soft" />
        </IconWell>
        <IconWell label="MagnifyingGlass">
          <MagnifyingGlass size={20} weight="thin" className="text-ink-soft" />
        </IconWell>
        <IconWell label="Plus">
          <Plus size={20} weight="thin" className="text-ink-soft" />
        </IconWell>
      </div>
    </Section>
  );
}

function IconWell({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex size-10 items-center justify-center rounded-sm border border-line bg-elevated shadow-card">
        {children}
      </div>
      <div className="font-mono text-[10px] text-ink-muted">{label}</div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default App;
