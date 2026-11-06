import { useEffect, useState } from 'react';
import { isPapiParentMessage, notifyPapiParent } from './papi-parent';

export function usePapiHost() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (isPapiParentMessage(event) && event.data?.type === 'papi:host-ready') setReady(true);
    };
    window.addEventListener('message', receive);
    notifyPapiParent({ type: 'papi:host-request' });
    return () => window.removeEventListener('message', receive);
  }, []);
  return ready;
}
