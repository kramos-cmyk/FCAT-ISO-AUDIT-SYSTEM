import React from 'react';

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  confirmVariant = 'primary',
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  confirmVariant?: 'primary' | 'danger' | 'green' | 'gold';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  const btnCls =
    confirmVariant === 'danger'
      ? 'bg-[#A32424] hover:bg-[#7E1C1C] text-white'
      : confirmVariant === 'green'
      ? 'bg-[#2F6D39] hover:bg-[#255A2D] text-white'
      : confirmVariant === 'gold'
      ? 'bg-[#C9A227] hover:bg-[#A9861E] text-[#4A1219]'
      : 'bg-[#6B1A25] hover:bg-[#4A1219] text-white';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#2B2323]/55 backdrop-blur-[2px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
    >
      <div className="bg-white border border-[#EAD9D4] rounded-xl max-w-md w-full p-6 shadow-2xl">
        <h3 id="confirm-modal-title" className="text-lg font-bold text-[#4A1219] m-0">
          {title}
        </h3>
        <p className="text-sm text-[#574D4D] mt-2 mb-5 leading-relaxed">{description}</p>
        <div className="flex justify-end gap-2.5">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="px-4 py-2 text-sm font-semibold rounded-lg border border-[#EAD9D4] text-[#2B2323] hover:bg-[#F8F4F0] cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-semibold rounded-lg cursor-pointer disabled:opacity-50 ${btnCls}`}
          >
            {busy ? 'Working...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
