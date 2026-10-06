import { useTranslation } from 'react-i18next';
import { Card, CardTitle, Skeleton } from '@/components/ui/misc';
import { Segmented, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ErrorState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { errorMessage } from '@/lib/errors';
import { useTheme } from '@/lib/theme';
import { useChangeTheme } from '@/features/shell/useChangeTheme';
import { useProfile } from './api';
import { ProfileTab } from './ProfileTab';
import { SecurityTab } from './SecurityTab';

export type ProfileTabName = 'profile' | 'security' | 'appearance';

function AppearanceTab() {
  const { t } = useTranslation('profile');
  const { theme } = useTheme();
  const changeTheme = useChangeTheme();
  return (
    <Card className="max-w-[800px]">
      <CardTitle className="mb-4">{t('appearance.title')}</CardTitle>
      <Segmented
        label={t('appearance.label')}
        value={theme}
        onValueChange={changeTheme}
        className="w-full sm:w-auto"
        options={[
          { value: 'light', label: t('shell:theme.light') },
          { value: 'dark', label: t('shell:theme.dark') },
          { value: 'system', label: t('shell:theme.system') },
        ]}
      />
      <p className="m-0 mt-3 text-[13px] text-text-muted">{t('appearance.hint')}</p>
    </Card>
  );
}

export function ProfilePage({ tab, onTabChange }: { tab: ProfileTabName; onTabChange: (tab: ProfileTabName) => void }) {
  const { t } = useTranslation('profile');
  const profile = useProfile();

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <Tabs value={tab} onValueChange={(v) => onTabChange(v === 'security' || v === 'appearance' ? v : 'profile')}>
        <TabsList aria-label={t('tabs.label')}>
          <TabsTrigger value="profile">{t('tabs.profile')}</TabsTrigger>
          <TabsTrigger value="security">{t('tabs.security')}</TabsTrigger>
          <TabsTrigger value="appearance">{t('tabs.appearance')}</TabsTrigger>
        </TabsList>
        {profile.isPending ? (
          <div className="grid gap-[18px] lg:grid-cols-[220px_minmax(0,1fr)]" aria-busy="true">
            <div className="crm-card p-5">
              <Skeleton className="mx-auto size-[110px] rounded-full" />
              <Skeleton className="mx-auto mt-3 h-4 w-28" />
            </div>
            <div className="crm-card grid gap-3 p-5 sm:grid-cols-2">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          </div>
        ) : profile.isError || !profile.data ? (
          <Card>
            <ErrorState title={t('common:errors.loadFailed')} description={errorMessage(profile.error)} onRetry={() => void profile.refetch()} retryLabel={t('common:actions.retry')} />
          </Card>
        ) : (
          <>
            <TabsContent value="profile" forceMount hidden={tab !== 'profile'}>
              <ProfileTab data={profile.data} />
            </TabsContent>
            <TabsContent value="security">
              <SecurityTab user={profile.data.user} />
            </TabsContent>
            <TabsContent value="appearance">
              <AppearanceTab />
            </TabsContent>
          </>
        )}
      </Tabs>
    </>
  );
}
