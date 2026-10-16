/**
 * The queue send after an upload has been kept (Stage 5 and 7 reviews). The upload's row is committed first; if
 * the send then fails, nothing would ever read it and the screen would wait forever. So the row is set aside
 * (the photo discarded, the import failed) and the caller answers 503 for the person to send it again. A failure
 * to set it aside is logged and still answers false: the send is what failed.
 */
export async function sendOrUndo(
  send: () => Promise<unknown>,
  undo: () => Promise<unknown>,
  report: (error: unknown, step: 'send' | 'undo') => void,
): Promise<boolean> {
  try {
    await send();
    return true;
  } catch (error) {
    report(error, 'send');
    await undo().catch((e: unknown) => report(e, 'undo'));
    return false;
  }
}
