import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';

// React.StrictMode removed — it causes @hello-pangea/dnd Droppables to
// fail registration in React 18 (double-invoke mount tears down the dnd
// context before Droppables can register, making destination always null).
ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
