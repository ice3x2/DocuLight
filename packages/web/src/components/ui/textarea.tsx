import { forwardRef, type TextareaHTMLAttributes } from 'react';

import { cn } from '../../lib/utils.js';

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => (
  <textarea ref={ref} data-slot="textarea" className={cn('dl-textarea', className)} {...props} />
));
Textarea.displayName = 'Textarea';
