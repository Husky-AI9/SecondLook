import * as Clipboard from 'expo-clipboard';

/** True if the clipboard holds text. On iOS this does not trigger the paste prompt. */
export async function clipboardHasText(): Promise<boolean> {
  try {
    return await Clipboard.hasStringAsync();
  } catch {
    return false;
  }
}

/** Reads the clipboard. iOS shows its own "Allow Paste" prompt; a refusal returns ''. */
export async function readClipboard(): Promise<string> {
  try {
    return (await Clipboard.getStringAsync()) || '';
  } catch {
    return '';
  }
}

export async function writeClipboard(text: string): Promise<boolean> {
  try {
    await Clipboard.setStringAsync(text);
    return true;
  } catch {
    return false;
  }
}
