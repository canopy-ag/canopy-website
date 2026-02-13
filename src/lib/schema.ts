import { z } from 'zod';

/**
 * Demo Form Validation Schema
 * 
 * Validates and sanitizes form submissions before database insertion.
 */

export const DemoSubmissionSchema = z.object({
  companyName: z
    .string()
    .min(1, 'Company name is required')
    .max(255, 'Company name must be less than 255 characters')
    .trim(),
  
  contactName: z
    .string()
    .min(1, 'Contact name is required')
    .max(255, 'Contact name must be less than 255 characters')
    .trim(),
  
  email: z
    .string()
    .email('Please enter a valid email address')
    .max(255, 'Email must be less than 255 characters')
    .toLowerCase()
    .trim(),
  
  phone: z
    .string()
    .max(50, 'Phone number must be less than 50 characters')
    .optional()
    .default(''),
  
  companySize: z
    .enum(['', '1-10', '11-50', '51-200', '200+'])
    .optional()
    .default(''),
  
  message: z
    .string()
    .max(5000, 'Message must be less than 5000 characters')
    .optional()
    .default(''),
});

export type DemoSubmission = z.infer<typeof DemoSubmissionSchema>;

/**
 * Format validation errors for client response
 */
export function formatValidationErrors(errors: z.ZodError) {
  return errors.errors.map((error) => ({
    field: error.path.join('.'),
    message: error.message,
  }));
}
