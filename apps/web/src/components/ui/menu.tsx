import * as React from 'react';
import { DropdownMenu as Menu } from 'radix-ui';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;
export const DropdownMenuGroup = Menu.Group;
export const DropdownMenuRadioGroup = Menu.RadioGroup;
export const DropdownMenuSub = Menu.Sub;

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  align = 'end',
  ...props
}: React.ComponentProps<typeof Menu.Content>) {
  return (
    <Menu.Portal>
      <Menu.Content
        sideOffset={sideOffset}
        align={align}
        collisionPadding={12}
        className={cn(
          'z-50 min-w-[200px] max-w-[calc(100vw-24px)] animate-fade-in rounded-[11px] border border-border bg-popover p-[7px] text-popover-foreground shadow-pop outline-none',
          className,
        )}
        {...props}
      />
    </Menu.Portal>
  );
}

const itemClass =
  'relative flex min-h-11 w-full cursor-pointer select-none items-center gap-2.5 rounded-[7px] px-[11px] text-[14px] font-bold text-text outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-surface-muted md:min-h-9 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-text-muted';

export function DropdownMenuItem({
  className,
  destructive,
  ...props
}: React.ComponentProps<typeof Menu.Item> & { destructive?: boolean }) {
  return (
    <Menu.Item
      className={cn(itemClass, destructive && 'text-danger data-[highlighted]:bg-danger-soft [&_svg]:text-danger', className)}
      {...props}
    />
  );
}

export function DropdownMenuRadioItem({ className, children, ...props }: React.ComponentProps<typeof Menu.RadioItem>) {
  return (
    <Menu.RadioItem className={cn(itemClass, 'pr-8', className)} {...props}>
      {children}
      <Menu.ItemIndicator className="absolute right-2.5">
        <Check className="!text-primary-ink" aria-hidden="true" />
      </Menu.ItemIndicator>
    </Menu.RadioItem>
  );
}

export function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof Menu.Label>) {
  return <Menu.Label className={cn('px-[11px] pb-1 pt-2 text-[11px] font-black uppercase tracking-[0.05em] text-text-muted', className)} {...props} />;
}

export function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<typeof Menu.Separator>) {
  return <Menu.Separator className={cn('-mx-[7px] my-[5px] h-px bg-border', className)} {...props} />;
}

export function DropdownMenuSubTrigger({ className, children, ...props }: React.ComponentProps<typeof Menu.SubTrigger>) {
  return (
    <Menu.SubTrigger className={cn(itemClass, 'data-[state=open]:bg-surface-muted', className)} {...props}>
      {children}
    </Menu.SubTrigger>
  );
}

export function DropdownMenuSubContent({ className, ...props }: React.ComponentProps<typeof Menu.SubContent>) {
  return (
    <Menu.Portal>
      <Menu.SubContent
        collisionPadding={12}
        className={cn(
          'z-50 min-w-[170px] animate-fade-in rounded-[11px] border border-border bg-popover p-[7px] text-popover-foreground shadow-pop outline-none',
          className,
        )}
        {...props}
      />
    </Menu.Portal>
  );
}
