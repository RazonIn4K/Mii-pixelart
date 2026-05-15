import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import CookieConsent from "./components/CookieConsent";
import { ThemeProvider } from "./contexts/ThemeContext";
import Cookies from "./pages/Cookies";
import Disclosure from "./pages/Disclosure";
import Guides from "./pages/Guides";
import Help from "@/pages/Help";
import Home from "./pages/Home";
import Privacy from "./pages/Privacy";
import Studio from "./pages/Studio";
import Support from "./pages/Support";
import Terms from "./pages/Terms";
import Unlock from "./pages/Unlock";


function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/studio"} component={Studio} />
      <Route path={"/privacy"} component={Privacy} />
      <Route path={"/terms"} component={Terms} />
      <Route path={"/cookies"} component={Cookies} />
      <Route path={"/disclosure"} component={Disclosure} />
      <Route path={"/affiliate-disclosure"} component={Disclosure} />
      <Route path={"/help"} component={Help} />
      <Route path={"/guides"} component={Guides} />
      <Route path={"/unlock"} component={Unlock} />
      <Route path={"/support"} component={Support} />
      <Route path={"/donate"} component={Support} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
          <CookieConsent />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
