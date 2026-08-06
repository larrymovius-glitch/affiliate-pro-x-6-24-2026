import React from "react";
import { Drawer } from "vaul";
import VoiceAtlas from "./VoiceAtlas";

export default function MobileAtlasDrawer({ open, onClose }) {
  return (
    <Drawer.Root open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[9998] bg-black/45 backdrop-blur-sm" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-[9999] flex max-h-[92vh] flex-col rounded-t-3xl bg-background shadow-2xl outline-none">
          <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-muted-foreground/30" />
          <div className="mt-3 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
            <VoiceAtlas onClose={onClose} />
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}