import * as Dialog from "@radix-ui/react-dialog";
import { X } from "@phosphor-icons/react";

import { cn } from "@/lib/utils";

export function ImageLightbox({
  src,
  alt,
  open,
  onOpenChange,
}: {
  src: string;
  alt: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-overlay" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-[91] max-h-[calc(100vh-48px)] w-[min(960px,calc(100vw-48px))]",
            "-translate-x-1/2 -translate-y-1/2 outline-none",
          )}
        >
          <Dialog.Title className="sr-only">{alt}</Dialog.Title>
          <div className="relative overflow-hidden rounded-md border border-line bg-elevated shadow-elevated">
            <img
              src={src}
              alt={alt}
              className="max-h-[calc(100vh-72px)] w-full object-contain"
            />
            <Dialog.Close asChild>
              <button
                type="button"
                className={cn(
                  "absolute right-2 top-2 inline-flex size-8 items-center justify-center rounded-sm",
                  "bg-elevated/90 text-ink-muted shadow-card transition-colors hover:bg-hover hover:text-ink",
                )}
                aria-label="关闭图片预览"
              >
                <X size={15} weight="bold" />
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
