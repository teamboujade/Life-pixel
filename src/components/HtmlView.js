// Affiche une page HTML locale (caméra IA, PDF) — version mobile : WebView native.
import React, { forwardRef } from 'react';
import { WebView } from 'react-native-webview';

const HtmlView = forwardRef(function HtmlView({ html, onMessage, style, camera }, ref) {
  return (
    <WebView
      ref={ref}
      source={{ html, baseUrl: 'https://localhost/' }}
      originWhitelist={['*']}
      javaScriptEnabled
      mediaPlaybackRequiresUserAction={false}
      allowsInlineMediaPlayback
      mediaCapturePermissionGrantType={camera ? 'grant' : undefined}
      onMessage={(e) => onMessage?.(e.nativeEvent.data)}
      style={style}
    />
  );
});

export default HtmlView;
