import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

try {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} catch (error) {
  console.error("Application failed to start:", error);
  rootElement.innerHTML = `
    <div style="padding: 20px; color: white; background: #09090b; height: 100vh; font-family: sans-serif;">
      <h1 style="color: #ef4444;">Startup Error</h1>
      <p>The application encountered an issue while loading.</p>
      <pre style="background: #18181b; padding: 15px; border-radius: 8px; overflow: auto; color: #f87171;">${error instanceof Error ? error.message : String(error)}</pre>
      <p style="font-size: 14px; color: #71717a;">Please check your Vercel logs and ensure your API_KEY environment variable is set.</p>
    </div>
  `;
}