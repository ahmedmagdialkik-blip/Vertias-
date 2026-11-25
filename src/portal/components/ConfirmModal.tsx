import React, { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = true,
  busy = false,
  onCancel,
  onConfirm
}) => {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#1A1217]/70 px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="v-confirm-title"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        className="w-full max-w-md border border-[#1A1217]/20 bg-[#FAF6EE] p-6 text-[#1A1217] shadow-2xl rounded-[2px] v-animate-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#1A1217]/12 pb-3.5">
          <div className="flex items-center gap-2.5">
            {danger ? (
              <AlertTriangle className="h-5 w-5 shrink-0 text-[#8A2B2B]" aria-hidden="true" />
            ) : null}
            <h2 id="v-confirm-title" className="font-display text-base font-semibold uppercase tracking-wide text-[#1A1217]">
              {title}
            </h2>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            aria-label="Close confirmation dialog"
            className="p-1 text-[#1A1217]/60 hover:text-[#1A1217]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-[#1A1217]/85">{description}</p>

        <div className="mt-6 flex items-center justify-end gap-2.5">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="v-btn v-btn-secondary"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`v-btn ${danger ? 'v-btn-danger' : 'v-btn-primary'}`}
          >
            {busy ? 'Working...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
