import * as PopoverPrimitive from '@radix-ui/react-popover';
import { forwardRef } from 'react';

import { cn } from '../../lib/utils.js';
import { useOverlayOwner } from './overlay-owner.js';

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;
export const PopoverClose = PopoverPrimitive.Close;

// @req IR-SHELL-008
export const PopoverContent = forwardRef<React.ElementRef<typeof PopoverPrimitive.Content>, React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>>(
  ({ align = 'center', className, sideOffset = 4, ...props }, ref) => {
    const owner = useOverlayOwner();
    return (
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          ref={ref}
          align={align}
          sideOffset={sideOffset}
          className={cn('dl-popover-content', className)}
          {...props}
          data-slot="popover-content"
          data-overlay-owner-kind={owner.kind}
          data-overlay-owner-id={owner.id}
        />
      </PopoverPrimitive.Portal>
    );
  },
);
PopoverContent.displayName = PopoverPrimitive.Content.displayName;
