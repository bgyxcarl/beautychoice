const formId = import.meta.env.VITE_FORMSPREE_FORM_ID;

export const formspreeConfigured = !!formId;

export async function submitContactForm({ name, email, message }) {
  if (!formId) throw new Error('VITE_FORMSPREE_FORM_ID not configured');
  const res = await fetch(`https://formspree.io/f/${formId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ name, email, message }),
  });
  if (!res.ok) throw new Error('Formspree submission failed: ' + res.status);
  return res.json();
}
