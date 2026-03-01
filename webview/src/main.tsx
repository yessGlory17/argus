import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const vscode = acquireVsCodeApi();
window.vscodeApi = vscode;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

declare function acquireVsCodeApi(): {
  postMessage: (message: any) => void;
  getState: () => any;
  setState: (state: any) => void;
};
