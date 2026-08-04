const clientId = import.meta.env.VITE_PAYPAL_CLIENT_ID;

export const paypalConfigured = !!clientId;

let sdkPromise = null;

export function loadPayPalSdk() {
  if (!clientId) return Promise.reject(new Error('VITE_PAYPAL_CLIENT_ID not configured'));
  if (window.paypal) return Promise.resolve(window.paypal);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=CAD`;
    script.onload = () => resolve(window.paypal);
    script.onerror = () => { sdkPromise = null; reject(new Error('Failed to load PayPal SDK')); };
    document.head.appendChild(script);
  });
  return sdkPromise;
}
