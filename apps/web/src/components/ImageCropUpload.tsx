import * as React from 'react';
import Cropper from 'react-easy-crop';
import { useTranslation } from 'react-i18next';
import { ImagePlus, Trash2, Upload } from 'lucide-react';
import { ACCEPTED_IMAGE_TYPES } from '@crm/contracts';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/overlays';
import { Progress } from '@/components/ui/misc';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { checkImageFile, cropToDataUrl, type PixelArea } from '@/lib/image';
import { cn } from '@/lib/utils';

export type ImageCropUploadProps = {
  label: string;
  /** Width / height of the crop area (and output). */
  aspect: number;
  output: { width: number; height: number };
  /** `wide` = 16:9 banner preview, `logo` = compact rectangle, `avatar` = circle. */
  variant: 'logo' | 'wide' | 'avatar';
  /** Current image (remote URL or a pending data URL). */
  value?: string | null;
  /**
   * Called with the cropped data URL. Return a promise to show upload progress; the
   * preview reverts if it rejects. (Existing records upload here; new records keep it in form state.)
   */
  onApply: (dataUrl: string) => void | Promise<unknown>;
  onRemove?: () => void | Promise<unknown>;
  removeConfirm?: { title: string; body: React.ReactNode; confirmLabel: string };
  /** Shows "Will upload when the account is saved". */
  pending?: boolean;
  disabled?: boolean;
  hint?: React.ReactNode;
  className?: string;
  /** Rendered inside the avatar circle when there is no image (e.g. initials). */
  fallback?: React.ReactNode;
};

export function ImageCropUpload({
  label,
  aspect,
  output,
  variant,
  value,
  onApply,
  onRemove,
  removeConfirm,
  pending,
  disabled,
  hint,
  className,
  fallback,
}: ImageCropUploadProps) {
  const { t } = useTranslation();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const inputId = React.useId();
  const [source, setSource] = React.useState<string | null>(null);
  const [crop, setCrop] = React.useState({ x: 0, y: 0 });
  const [zoom, setZoom] = React.useState(1);
  const [area, setArea] = React.useState<PixelArea | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [optimistic, setOptimistic] = React.useState<string | null>(null);
  const [dragOver, setDragOver] = React.useState(false);
  const [confirmRemove, setConfirmRemove] = React.useState(false);

  React.useEffect(() => () => {
    if (source) URL.revokeObjectURL(source);
  }, [source]);

  const shown = optimistic ?? value ?? null;

  const openFile = (file: File | undefined) => {
    if (!file) return;
    const problem = checkImageFile(file);
    if (problem) {
      setError(problem === 'size' ? t('image.tooLarge') : t('image.badType'));
      return;
    }
    setError(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setSource(URL.createObjectURL(file));
  };

  const closeCropper = () => {
    setSource(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const apply = async () => {
    if (!source || !area) return;
    let dataUrl: string;
    try {
      dataUrl = await cropToDataUrl(source, area, output, variant === 'logo' ? 'image/png' : 'image/jpeg');
    } catch {
      setError(t('image.readFailed'));
      return;
    }
    closeCropper();
    setOptimistic(dataUrl);
    const result = onApply(dataUrl);
    if (result instanceof Promise) {
      setBusy(true);
      try {
        await result;
      } catch {
        setOptimistic(null);
      } finally {
        setBusy(false);
      }
    }
  };

  // Once the parent reflects the new value, drop the optimistic copy.
  React.useEffect(() => {
    if (!busy) setOptimistic(null);
  }, [value, busy]);

  const doRemove = async () => {
    if (!onRemove) return;
    await onRemove();
  };

  const accept = ACCEPTED_IMAGE_TYPES.join(',');
  const pick = () => inputRef.current?.click();

  const dropHandlers = {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      if (!disabled) setDragOver(true);
    },
    onDragLeave: () => setDragOver(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (!disabled) openFile(e.dataTransfer.files[0]);
    },
  };

  const preview =
    variant === 'avatar' ? (
      <div className="relative mx-auto my-2.5 size-[110px] overflow-hidden rounded-full bg-gradient-to-br from-[#333] to-[#777] text-[34px] font-black text-white">
        {shown ? (
          <img src={shown} alt={t('image.preview', { label })} className="size-full object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center" aria-hidden="true">
            {fallback}
          </span>
        )}
      </div>
    ) : shown ? (
      <div
        className={cn(
          'flex items-center justify-center overflow-hidden rounded-[10px] border border-border bg-[repeating-conic-gradient(#f1f3f6_0_25%,#fff_0_50%)] bg-[length:16px_16px] dark:bg-[repeating-conic-gradient(#1e252e_0_25%,#171d25_0_50%)]',
          variant === 'wide' ? 'aspect-video w-full' : 'h-[96px] w-full p-3',
        )}
      >
        <img
          src={shown}
          alt={t('image.preview', { label })}
          className={cn(variant === 'wide' ? 'size-full object-cover' : 'max-h-full max-w-full object-contain')}
        />
      </div>
    ) : (
      <button
        type="button"
        onClick={pick}
        disabled={disabled}
        {...dropHandlers}
        className={cn(
          'flex w-full flex-col items-center justify-center gap-1 rounded-[10px] border-[1.5px] border-dashed border-[#cfd5dd] bg-[#fafbfc] p-[18px] text-center text-text-muted transition-colors hover:border-primary hover:bg-primary-soft/40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus-ring disabled:cursor-not-allowed dark:border-border-strong dark:bg-background',
          variant === 'wide' ? 'aspect-[16/6] min-h-[105px]' : 'min-h-[96px]',
          dragOver && 'border-primary bg-primary-soft/60',
        )}
      >
        <ImagePlus className="size-5" aria-hidden="true" />
        <span>
          {t('image.dropOr')} <b className="text-primary-ink">{t('image.browse')}</b>
          <span className="sr-only"> — {label}</span>
        </span>
        <span className="text-[12px]">{t('image.rules')}</span>
      </button>
    );

  return (
    <div className={className} {...(variant !== 'avatar' && shown ? dropHandlers : {})}>
      {variant !== 'avatar' && (
        <label htmlFor={inputId} className="mb-1.5 block text-[12px] font-bold text-text-muted">
          {label}
        </label>
      )}
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        disabled={disabled}
        onChange={(e) => openFile(e.target.files?.[0])}
      />
      {preview}
      {busy && (
        <div className="mt-2" aria-live="polite">
          <Progress value={100} label={t('image.uploading')} tone="primary" className="animate-shimmer" />
          <p className="m-0 mt-1 text-[12px] text-text-muted">{t('image.uploading')}</p>
        </div>
      )}
      {(shown || variant === 'avatar') && (
        <div className={cn('mt-2 flex flex-wrap gap-2', variant === 'avatar' && 'justify-center')}>
          <Button size="sm" variant="secondary" onClick={pick} disabled={disabled || busy}>
            <Upload aria-hidden="true" />
            {t('image.change')}
            <span className="sr-only"> — {label}</span>
          </Button>
          {onRemove && shown && (
            <Button size="sm" variant="danger" onClick={() => (removeConfirm ? setConfirmRemove(true) : void doRemove())} disabled={disabled || busy}>
              <Trash2 aria-hidden="true" />
              {t('image.remove')}
            </Button>
          )}
        </div>
      )}
      {pending && !busy && <p className="m-0 mt-1.5 text-[12px] font-bold text-warning">{t('image.pending')}</p>}
      {error && (
        <p className="m-0 mt-1.5 text-[12px] font-bold text-danger" role="alert">
          {error}
        </p>
      )}
      {hint && !error && <p className="m-0 mt-1.5 text-[12px] text-text-muted">{hint}</p>}

      <Dialog open={!!source} onOpenChange={(o) => !o && closeCropper()}>
        <DialogContent
          title={t('image.cropTitle')}
          description={t('image.cropHelp')}
          className={variant === 'wide' ? 'sm:max-w-[760px]' : undefined}
          footer={
            <>
              <Button variant="secondary" onClick={closeCropper}>
                {t('actions.cancel')}
              </Button>
              <Button variant="primary" onClick={() => void apply()} disabled={!area}>
                {t('image.apply')}
              </Button>
            </>
          }
        >
          <div className="relative h-[min(52dvh,380px)] w-full overflow-hidden rounded-[10px] bg-[#0b1018]">
            {source && (
              <Cropper
                image={source}
                crop={crop}
                zoom={zoom}
                aspect={aspect}
                cropShape={variant === 'avatar' ? 'round' : 'rect'}
                showGrid={variant !== 'avatar'}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_, px) => setArea(px)}
                disableAutomaticStylesInjection
              />
            )}
          </div>
          <label className="mt-4 flex items-center gap-3">
            <span className="text-[12px] font-bold text-text-muted">{t('image.zoom')}</span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="h-11 flex-1 accent-[var(--primary)]"
            />
          </label>
        </DialogContent>
      </Dialog>

      {removeConfirm && (
        <ConfirmDialog
          open={confirmRemove}
          onOpenChange={setConfirmRemove}
          title={removeConfirm.title}
          description={removeConfirm.body}
          confirmLabel={removeConfirm.confirmLabel}
          destructive
          onConfirm={doRemove}
        />
      )}
    </div>
  );
}
