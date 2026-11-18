import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BenchPage } from "./bench/BenchPage";
import { App } from "./ui/App";
import "./ui/theme.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

// The model benchmark lives at ?bench so the static site needs no router.
const isBench = new URLSearchParams(location.search).has("bench");

createRoot(root).render(<StrictMode>{isBench ? <BenchPage /> : <App />}</StrictMode>);
