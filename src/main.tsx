import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./ErrorBoundary";
import WebUpdate from "./WebUpdate";
import "./styles.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
      <WebUpdate />
    </ErrorBoundary>
  </React.StrictMode>,
);
