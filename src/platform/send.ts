import { Linking, Platform } from 'react-native';
import { writeClipboard } from './clipboard';

export type SendOutcome = 'opened-messages' | 'copied' | 'failed';

/**
 * Hands the chosen reply to the user's messaging app with the text filled in.
 * The user presses send. Quotekey never sends anything itself.
 */
export async function openInMessages(body: string): Promise<SendOutcome> {
  const copied = await writeClipboard(body);
  if (Platform.OS === 'ios' || Platform.OS === 'android') {
    // iOS wants "sms:&body=", Android wants "sms:?body=".
    const url = Platform.OS === 'ios' ? `sms:&body=${encodeURIComponent(body)}` : `sms:?body=${encodeURIComponent(body)}`;
    try {
      await Linking.openURL(url);
      return 'opened-messages';
    } catch {
      return copied ? 'copied' : 'failed';
    }
  }
  return copied ? 'copied' : 'failed';
}

export const sendLabel = Platform.OS === 'web' ? 'Copy reply' : 'Open in Messages';
