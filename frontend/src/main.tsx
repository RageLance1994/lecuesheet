import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./pages/App";
import "@fortawesome/fontawesome-free/css/all.min.css";
import "./styles/globals.css";

ReactDOM.createRoot(document.getElementById("app") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
