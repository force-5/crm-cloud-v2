import { useState } from 'react';
import type { CurrentUser } from '@crm/contracts';
import { initials } from '@/lib/utils';

/** Round avatar: profile photo, or initials on charcoal (prototype .avatar). */
export function UserAvatar({
  user,
  size = 35,
}: {
  user: Pick<CurrentUser, 'firstName' | 'lastName' | 'profileImageUrl'>;
  size?: number;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const src = user.profileImageUrl && failed !== user.profileImageUrl ? user.profileImageUrl : null;
  return (
    <span
      aria-hidden="true"
      className="grid shrink-0 place-items-center overflow-hidden rounded-full bg-avatar font-black text-white"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.37) }}
    >
      {src ? (
        <img src={src} alt="" className="size-full object-cover" onError={() => setFailed(src)} />
      ) : (
        initials(user.firstName, user.lastName)
      )}
    </span>
  );
}
