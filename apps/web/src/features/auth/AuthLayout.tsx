import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { BrandMark, BrandWordmark } from '@/components/Brand';

/** Decorative tilted mock app cards (prototype .crm-art). Purely visual. */
function LoginArt() {
  const { t } = useTranslation('auth');
  const rows = [t('visual.sample1'), t('visual.sample2'), t('visual.sample3'), t('visual.sample4')];
  const card = 'absolute overflow-hidden rounded-[14px] bg-white text-[#202630] shadow-[0_24px_70px_rgba(0,0,0,0.45)]';
  const bar = 'flex h-[42px] items-center gap-[7px] border-b border-[#e8eaee] bg-[#f7f8fa] px-3.5';
  const dot = 'size-[7px] rounded-full bg-[#d6d9de]';
  return (
    <div className="relative h-[460px] w-[min(650px,90%)]" aria-hidden="true">
      <div className={`${card} left-[4%] top-[11%] h-[70%] w-[82%] -rotate-2`}>
        <div className={bar}>
          <span className={dot} />
          <span className={dot} />
          <span className={dot} />
        </div>
        <div className="p-[18px]">
          <div className="grid grid-cols-3 gap-2.5">
            {[
              [t('visual.accounts'), '128'],
              [t('visual.active'), '112'],
              [t('visual.drafts'), '7'],
            ].map(([label, n]) => (
              <div key={label} className="h-16 rounded-lg bg-[#f5f6f8] p-2.5">
                <span className="text-[12px] text-[#6b7280]">{label}</span>
                <b className="mt-[5px] block text-[19px]">{n}</b>
              </div>
            ))}
          </div>
          <div className="my-[13px] h-2.5 w-[70%] rounded-[5px] bg-[#f36b2133]" />
          <div>
            {rows.map((r) => (
              <div key={r} className="flex h-[35px] items-center gap-2.5 border-t border-[#eef0f2]">
                <i className="size-[22px] rounded-full bg-[#f36b2124]" />
                <b className="text-[14px]">{r}</b>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className={`${card} bottom-0 right-0 h-1/2 w-[43%] rotate-[4deg]`}>
        <div className={bar} />
        <div className="p-[18px]">
          <b className="text-[14px]">{t('visual.provisioning')}</b>
          <div className="my-[13px] h-2.5 w-[70%] rounded-[5px] bg-[#f36b2133]" />
          <div className="my-[13px] h-2.5 rounded-[5px] bg-[#eceff2]" />
          <div className="my-[13px] h-2.5 w-4/5 rounded-[5px] bg-[#eceff2]" />
          <div className="my-[13px] h-2.5 w-[58%] rounded-[5px] bg-[#eceff2]" />
        </div>
      </div>
    </div>
  );
}

/**
 * Split sign-in layout (prototype .loginpage): white form panel on the left, decorative dark
 * panel on the right. Below 1024px only the form panel shows.
 */
export function AuthLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation('auth');
  return (
    <div className="min-h-dvh bg-surface lg:grid lg:grid-cols-[minmax(440px,44%)_1fr] lg:bg-[#0f141a]">
      <main className="relative z-[2] flex min-h-dvh items-center justify-center bg-surface px-5 py-10 sm:px-[50px] sm:py-[50px]">
        <div className="w-full max-w-[420px]">
          <div className="mb-10 flex items-center gap-3 sm:mb-11">
            <BrandMark size="lg" />
            <BrandWordmark tone="dark" />
          </div>
          {children}
          <p className="m-0 mt-6 text-center text-[12px] text-text-muted">{t('internalOnly')}</p>
        </div>
      </main>
      <div className="relative hidden items-center justify-center overflow-hidden bg-gradient-to-br from-[#151a21] via-[#222a34] to-[#10151b] p-[70px] text-white lg:flex">
        <div className="login-visual-pattern pointer-events-none absolute inset-0" aria-hidden="true" />
        <LoginArt />
        <div className="absolute bottom-[9%] left-[9%] z-[3] pr-8">
          <h2 className="m-0 mb-2 text-[28px] font-black">{t('visual.title')}</h2>
          <p className="m-0 max-w-[480px] leading-[1.55] text-[#b9c0c9]">{t('visual.body')}</p>
        </div>
      </div>
    </div>
  );
}

export function AuthHeading({ title, lead }: { title: ReactNode; lead?: ReactNode }) {
  return (
    <>
      <h1 className="m-0 mb-2 text-[30px] font-black leading-tight text-text sm:text-[34px]">{title}</h1>
      {lead && <p className="m-0 mb-7 leading-normal text-text-muted">{lead}</p>}
    </>
  );
}
