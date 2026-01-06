
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';

console.log('Lootify: Initializing Core...');

const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error("Lootify Fatal: Could not find root element");
  throw new Error("Could not find root element to mount to");
}

try {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  console.log('Lootify: Core Mounted Successfully.');
} catch (err) {
  console.error('Lootify Fatal: Render Cycle Failed', err);
  const bootErr = document.getElementById('boot-error');
  if (bootErr) {
    bootErr.style.display = 'block';
    bootErr.innerText = 'Render Error: ' + (err as Error).message;
  }
}
