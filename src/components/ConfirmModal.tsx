import React, { useEffect, useRef } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = true,
  busy = false,
  onConfirm,
  onCancel
}) => {
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    cancelBtnRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        onCancel();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#1A1217]/75 px-4 py-6 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      aria-describedby="confirm-modal-desc"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        className="w-full max-w-md border border-[#1A1217]/20 bg-[#EDE6D6] p-6 text-[#1A1217] shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#1A1217]/15 pb-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-[#1A1217]/20 bg-[#FAF6EE] text-[#1A1217]">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            </span>
            <h2
              id="confirm-modal-title"
              className="font-['Cinzel',serif] text-lg font-semibold tracking-wide text-[#1A1217]"
            >
              {title}
            </h2>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            aria-label="Close confirmation dialog"
            className="flex h-9 w-9 shrink-0 items-center justify-center border border-transparent text-[#1A1217]/70 hover:border-[#1A1217]/20 hover:text-[#1A1217] focus-visible:outline-2 focus-visible:outline-[#2F6B34]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <p
          id="confirm-modal-desc"
          className="mt-4 font-['Cormorant_Garamond',Georgia,serif] text-lg leading-relaxed text-[#1A1217]/85"
        >
          {description}
        </p>

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            ref={cancelBtnRef}
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="min-h-[44px] whitespace-nowrap border border-[#1A1217]/25 bg-[#FAF6EE] px-5 py-2 font-['Cinzel',serif] text-xs font-semibold tracking-[0.1em] uppercase text-[#1A1217] transition hover:border-[#1A1217] focus-visible:outline-2 focus-visible:outline-[#2F6B34] disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`min-h-[44px] whitespace-nowrap px-5 py-2 font-['Cinzel',serif] text-xs font-semibold tracking-[0.1em] uppercase transition focus-visible:outline-2 focus-visible:outline-[#1A1217] disabled:opacity-50 ${
              danger
                ? 'border border-[#7C1E21] bg-[#7C1E21] text-[#EDE6D6] hover:bg-[#5E1518]'
                : 'border border-[#2F6B34] bg-[#2F6B34] text-[#EDE6D6] hover:bg-[#1F4A25]'
            }`}
          >
            {busy ? 'Working...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
