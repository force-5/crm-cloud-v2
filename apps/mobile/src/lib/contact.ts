import { Linking } from 'react-native';
import { haptics } from './haptics';

async function open(url: string): Promise<boolean> {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

/** Opens the dialer. Returns false if the device can't place calls (e.g. a simulator or tablet). */
export function callPhone(phone: string): Promise<boolean> {
  haptics.impact();
  return open(`tel:${phone.replace(/[^\d+]/g, '')}`);
}

export function textPhone(phone: string): Promise<boolean> {
  haptics.impact();
  return open(`sms:${phone.replace(/[^\d+]/g, '')}`);
}

export function sendEmail(email: string): Promise<boolean> {
  haptics.impact();
  return open(`mailto:${encodeURIComponent(email.trim())}`);
}
