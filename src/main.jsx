import "./styles/tokens.css";
import "./styles/hospital-ui.css";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { ThemeProvider } from "./theme/ThemeProvider.jsx";
import "./index.css";
import "./styles/theme.css";
import "./styles/components.css";
import "./styles/responsive.css";
import "./styles/print.css";
import "./styles/reference-ui-skin.css";
import "./styles/master-report-page-overrides.css";

createRoot(document.getElementById("root")).render(
  <ThemeProvider>
    <App />
  </ThemeProvider>,
);
