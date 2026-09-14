import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { locale } from "./i18n.ts";
import "./styles.css";

document.documentElement.lang = locale;
createRoot(document.getElementById("root")!).render(<App />);
