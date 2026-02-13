## Spec: Request Demo CTA Form

### Goal
Add a compelling "Request a Demo" CTA section with form to the homepage that captures lead information and sends it to the team.

### Background
Currently the CTA section just has email link. We need a proper lead capture form for potential customers to request demos.

### Tech Stack
- Astro 5.x
- React 18 for interactive components
- Tailwind CSS 4.x
- Existing color scheme: #22C55E (green), #00D4FF (blue)

### Requirements

#### Must Have
- [ ] CTA section with headline, subtext, and "Request Demo" button
- [ ] Modal that opens when button clicked
- [ ] Form fields:
  - Company name (required)
  - Contact name (required)
  - Email (required, validated)
  - Phone (optional)
  - Company size (dropdown: 1-10, 11-50, 51-200, 200+)
  - Message/notes (textarea, optional)
- [ ] Form validation with error messages
- [ ] Submit button with loading state
- [ ] Success confirmation after submission
- [ ] Form data sent via email (use Formspree or similar simple service)
- [ ] Match existing design system (glass cards, gradient text, button styles)

#### Nice to Have
- [ ] Smooth modal animations
- [ ] Form auto-save to localStorage
- [ ] reCAPTCHA or honeypot for spam prevention

### Technical Approach
1. Create `DemoForm.tsx` React component with modal + form
2. Add to homepage CTA section, replacing email link
3. Use Formspree (free tier) for form handling: `https://formspree.io/f/YOUR_FORM_ID`
4. Use existing `btn-primary`, `btn-secondary`, `glass` CSS classes
5. Form validation: HTML5 + custom validation logic

### API/Interface
```typescript
interface DemoFormData {
  companyName: string;
  contactName: string;
  email: string;
  phone?: string;
  companySize: '1-10' | '11-50' | '51-200' | '200+' | '';
  message?: string;
}
```

### Acceptance Criteria
- [ ] Form displays correctly on desktop and mobile
- [ ] All required fields validated before submit
- [ ] Invalid email shows error message
- [ ] Submit shows loading state
- [ ] Success message shown after submission
- [ ] Form data received at configured endpoint
- [ ] Modal can be closed via X button or clicking outside
- [ ] Design matches existing site aesthetic

### Estimated Complexity
- **M** — Single component, form handling, validation, modal logic
- Estimated: ~2-3 hours

### Token Budget for Implementation
- **M tier: 50K tokens**
- Checkpoints at 12K, 25K, 37K, 45K
- Escalate at: Email service setup, form validation logic
