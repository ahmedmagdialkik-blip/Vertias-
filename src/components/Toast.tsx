import React from 'react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  kind: 'success' | 'error';
  text: string;
}

interface ToastStackProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastStack: React.FC<ToastStackProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed right-4 bottom-4 z-50 flex w-[min(92vw,380px)] flex-col gap-2"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map(toast => (
        <div
          key={toast.id}
          role={toast.kind === 'error' ? 'alert' : 'status'}
          className={`flex items-start gap-3 border px-4 py-3 shadow-xl ${
            toast.kind === 'success'
              ? 'border-[#2F6B34] bg-[#1A1217] text-[#EDE6D6]'
              : 'border-[#B9383C] bg-[#2B1215] text-[#EDE6D6]'
          }`}
        >
          {toast.kind === 'success' ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#4F9A57]" aria-hidden="true" />
          ) : (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#F28B82]" aria-hidden="true" />
          )}
          <p className="min-w-0 flex-1 font-['Cormorant_Garamond',Georgia,serif] text-base leading-snug text-[#EDE6D6]">
            {toast.text}
          </p>
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            aria-label="Dismiss notification"
            className="shrink-0 p-1 text-[#EDE6D6]/70 hover:text-[#EDE6D6]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
};
