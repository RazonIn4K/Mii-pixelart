import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import CookieConsent from "./components/CookieConsent";
import { ThemeProvider } from "./contexts/ThemeContext";
import About from "./pages/About";
import Cookies from "./pages/Cookies";
import Disclosure from "./pages/Disclosure";
import Faq from "./pages/Faq";
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
      <Route path={"/faq"} component={Faq} />
      <Route path={"/about"} component={About} />
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
        {/* Skip-to-main link: keyboard users tabbing into the page get this
            as the first focusable element. Visually hidden until focused via
            the sr-only-focusable utility pattern; on Tab it slides into view
            in the top-left. Targets #main-content which every page renders
            via its <main> tag below the header. */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-sm focus:border focus:border-foreground/30 focus:bg-background focus:px-3 focus:py-1.5 focus:text-xs focus:font-medium focus:shadow"
        >
          Skip to main content
        </a>
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
