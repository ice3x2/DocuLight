import * as DialogPrimitive from '@radix-ui/react-dialog';
import { forwardRef, useId } from 'react';

import { cn } from '../../lib/utils.js';
import { OverlayOwnerContext } from './overlay-owner.js';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogPortal = DialogPrimitive.Portal;
export const DialogClose = DialogPrimitive.Close;

// @req IR-SHELL-008
export const DialogOverlay = forwardRef<React.ElementRef<typeof DialogPrimitive.Overlay>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>>(
  ({ className, ...props }, ref) => <DialogPrimitive.Overlay ref={ref} data-slot="dialog-overlay" className={cn('dl-overlay', className)} {...props} />,
);
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

// @req IR-SHELL-008
export const DialogContent = forwardRef<React.ElementRef<typeof DialogPrimitive.Content>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>>(
  ({ children, className, ...props }, ref) => {
    const ownerId = useId();
    return (
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          ref={ref}
          className={cn('dl-dialog-content', className)}
          {...props}
          data-slot="dialog-content"
          data-overlay-owner-kind="dialog"
          data-overlay-owner-id={ownerId}
        >
          <OverlayOwnerContext.Provider value={{ kind: 'dialog', id: ownerId }}>
            {children}
          </OverlayOwnerContext.Provider>
        </DialogPrimitive.Content>
      </DialogPortal>
    );
  },
);
DialogContent.displayName = DialogPrimitive.Content.displayName;

// @req IR-SHELL-008
export const DialogTitle = forwardRef<React.ElementRef<typeof DialogPrimitive.Title>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>>(
  ({ className, ...props }, ref) => <DialogPrimitive.Title ref={ref} data-slot="dialog-title" className={cn('dl-overlay-title', className)} {...props} />,
);
DialogTitle.displayName = DialogPrimitive.Title.displayName;

// @req IR-SHELL-008
export const DialogDescription = forwardRef<React.ElementRef<typeof DialogPrimitive.Description>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>>(
  ({ className, ...props }, ref) => <DialogPrimitive.Description ref={ref} data-slot="dialog-description" className={cn('dl-overlay-description', className)} {...props} />,
);
DialogDescription.displayName = DialogPrimitive.Description.displayName;
