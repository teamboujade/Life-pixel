// Version navigateur (iPhone / web app) : iframe même origine + postMessage.
import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

const HtmlView = forwardRef(function HtmlView({ html, onMessage, style }, ref) {
  const frame = useRef(null);
  const handler = useRef(onMessage);
  useEffect(() => {
    handler.current = onMessage;
  }, [onMessage]);

  useImperativeHandle(ref, () => ({
    injectJavaScript: (code) => frame.current?.contentWindow?.eval(code),
  }));

  useEffect(() => {
    const listener = (e) => {
      if (e.source === frame.current?.contentWindow && typeof e.data === 'string') handler.current?.(e.data);
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, []);

  return (
    <iframe
      ref={frame}
      title="contenu"
      srcDoc={html}
      allow="camera; autoplay; fullscreen"
      style={{ border: 0, width: '100%', height: '100%', flex: 1, background: '#000', ...(style || {}) }}
    />
  );
});

export default HtmlView;
