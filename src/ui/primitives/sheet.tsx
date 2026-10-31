import * as React from 'react';
import { Dialog as SheetPrimitive } from 'radix-ui';

import { useCloseOnBack } from '@/ui/hooks/use-close-on-back';

import { cn } from './utils';

function Sheet(props: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} {...useCloseOnBack(props)} />;
}

function SheetClose({ ...props }: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn('font-semibold text-foreground', className)}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

const SIDES = {
  bottom:
    'inset-x-0 bottom-0 rounded-t-[20px] pb-[env(safe-area-inset-bottom)] data-[state=closed]:slide-out-to-bottom-10 data-[state=open]:slide-in-from-bottom-10',
  right:
    'top-safe-3 right-safe-3 bottom-safe-3 w-[min(440px,calc(100vw-24px))] rounded-[16px] data-[state=closed]:slide-out-to-right-10 data-[state=open]:slide-in-from-right-10',
} as const;

/**
 * The sheet's panel (DESIGN.md 6 and 8): rising from the bottom edge with 20 px top corners, or
 * docked to the right with the panels' 16 px corners.
 */
function SheetContent({
  className,
  children,
  side = 'bottom',
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & { side?: keyof typeof SIDES }) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay
        data-slot="sheet-overlay"
        className="fixed inset-0 z-20 bg-black/30 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
      />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          'fixed z-20 flex flex-col bg-card text-card-foreground shadow-island outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:duration-240 data-[state=open]:ease-(--ease-drawer)',
          SIDES[side],
          className
        )}
        {...props}
      >
        {children}
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

export { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle };
