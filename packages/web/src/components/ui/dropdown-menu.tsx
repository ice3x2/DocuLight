import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { forwardRef } from 'react';

import { cn } from '../../lib/utils.js';
import { useOverlayOwner } from './overlay-owner.js';

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

// @req IR-SHELL-008
export const DropdownMenuContent = forwardRef<React.ElementRef<typeof DropdownMenuPrimitive.Content>, React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>>(
  ({ align = 'start', className, sideOffset = 4, ...props }, ref) => {
    const owner = useOverlayOwner();
    return (
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          ref={ref}
          align={align}
          sideOffset={sideOffset}
          className={cn('dl-dropdown-menu-content', className)}
          {...props}
          data-slot="dropdown-menu-content"
          data-overlay-owner-kind={owner.kind}
          data-overlay-owner-id={owner.id}
        />
      </DropdownMenuPrimitive.Portal>
    );
  },
);
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName;

// @req IR-SHELL-008
export const DropdownMenuItem = forwardRef<React.ElementRef<typeof DropdownMenuPrimitive.Item>, React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item>>(
  ({ className, ...props }, ref) => (
    <DropdownMenuPrimitive.Item ref={ref} data-slot="dropdown-menu-item" className={cn('dl-dropdown-menu-item', className)} {...props} />
  ),
);
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName;

export const DropdownMenuSeparator = DropdownMenuPrimitive.Separator;
