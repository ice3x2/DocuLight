import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes } from 'react';

import { cn } from '../../lib/utils.js';

const buttonVariants = cva('dl-button', {
  variants: {
    variant: {
      primary: 'dl-button-primary',
      secondary: 'dl-button-secondary',
      ghost: 'dl-button-ghost',
      destructive: 'dl-button-destructive',
    },
    size: {
      default: 'dl-control-default',
      auth: 'dl-control-auth',
      icon: 'dl-control-icon',
    },
  },
  defaultVariants: {
    variant: 'primary',
    size: 'default',
  },
});

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'default', type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = 'Button';

export { buttonVariants };
