import {
  Children,
  cloneElement,
  isValidElement,
  useId,
  type AriaAttributes,
  type ReactElement,
  type ReactNode,
} from 'react';

import { cn } from '../../lib/utils.js';

interface FieldControlProps extends AriaAttributes {
  id?: string;
}

export interface FieldProps {
  children: ReactElement<FieldControlProps>;
  className?: string;
  description?: ReactNode;
  error?: ReactNode;
  label: ReactNode;
}

export function Field({ children, className, description, error, label }: FieldProps) {
  const generatedId = useId();
  const control = Children.only(children);
  if (!isValidElement<FieldControlProps>(control)) return null;

  const controlId = control.props.id ?? `field-${generatedId}`;
  const descriptionId = description === undefined ? undefined : `${controlId}-description`;
  const errorId = error === undefined ? undefined : `${controlId}-error`;
  const describedBy = [control.props['aria-describedby'], descriptionId, errorId]
    .filter(Boolean)
    .join(' ') || undefined;

  return (
    <div data-slot="field" className={cn('dl-field', className)}>
      <label htmlFor={controlId}>{label}</label>
      {cloneElement(control, {
        id: controlId,
        'aria-describedby': describedBy,
        'aria-invalid': error === undefined ? control.props['aria-invalid'] : true,
      })}
      {description === undefined ? null : (
        <p id={descriptionId} data-slot="field-description">{description}</p>
      )}
      {error === undefined ? null : (
        <p data-slot="field-error">
          <span data-slot="field-error-icon" aria-hidden="true">!</span>
          <span id={errorId}>{error}</span>
        </p>
      )}
    </div>
  );
}
