import React from 'react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';

export interface ToastMessage {
  id: number;
  kind: 'success' | 'error';
  text: string;
}

interface ToastBannerProps {
  toast: ToastMessage | null;
  onDismiss: () => void;
}

export const ToastBanner: React.FC<ToastBannerProps> = ({ toast, onDismiss }) => {
  if (!toast) return null;
  const isError = toast.kind === 'error';

  return (
    <div
      role={isError ? 'alert' : 'status'}
      className={`fixed bottom-5 right-5 z-50 flex max-w-md items-start gap-3 rounded-[2px] border px-4 py-3 shadow-lg v-animate-in ${
        isError
          ? 'border-[#8A2B2B]/40 bg-[#FAF6EE] text-[#6F2020]'
          : 'border-[#2F6B34]/40 bg-[#1A1217] text-[#EDE6D6]'
      }`}
    >
      {isError ? (
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#8A2B2B]" aria-hidden="true" />
      ) : (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#4F9A57]" aria-hidden="true" />
      )}
      <p className="text-sm font-medium leading-snug">{toast.text}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="ml-2 p-0.5 opacity-70 hover:opacity-100"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
};
