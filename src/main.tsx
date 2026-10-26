import './webmcp';
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import {startAppUpdateChecks} from "./domain/appUpdateClient";
import "./index.css";
startAppUpdateChecks();
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
