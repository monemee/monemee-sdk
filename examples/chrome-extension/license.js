// npm i @monemee/client   ·   service worker or popup (bundled)
import { createLicense } from '@monemee/client';

// chrome.storage instead of localStorage (service workers have none)
const storage = {
  get: async (k) => (await chrome.storage.local.get(k))[k] ?? null,
  set: (k, v) => chrome.storage.local.set({ [k]: v }),
  remove: (k) => chrome.storage.local.remove(k)
};

export const license = createLicense({ productId: 123, storage, graceDays: 14 });

export async function isPro() {
  return (await license.check()).valid;
}
