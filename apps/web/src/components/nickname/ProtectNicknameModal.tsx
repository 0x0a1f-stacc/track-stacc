"use client";
import { Modal } from "@trackstacc/ui";
export function ProtectNicknameModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Modal open={open} title="Protect nickname" onClose={onClose}>
      <p className="text-sm text-zinc-300">
        Protected nicknames cannot be recovered if you forget the password.
      </p>
    </Modal>
  );
}
