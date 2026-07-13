import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { lazy, Suspense, type ReactNode } from "react";
import { Redirect, Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import CookieConsent from "./components/CookieConsent";
import { AnalyticsLoader } from "./components/AnalyticsLoader";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import {
  currentRelativeReturnTo,
  setupPathForReturnTo,
} from "./lib/community/return-to";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";

const About = lazy(() => import("./pages/About"));
const Cookies = lazy(() => import("./pages/Cookies"));
const Disclosure = lazy(() => import("./pages/Disclosure"));
const Faq = lazy(() => import("./pages/Faq"));
const Guides = lazy(() => import("./pages/Guides"));
const Help = lazy(() => import("./pages/Help"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Studio = lazy(() => import("./pages/Studio"));
const Support = lazy(() => import("./pages/Support"));
const Terms = lazy(() => import("./pages/Terms"));
const Unlock = lazy(() => import("./pages/Unlock"));
const Discover = lazy(() => import("./pages/community/Discover"));
const Search = lazy(() => import("./pages/community/Search"));
const UserProfile = lazy(() => import("./pages/community/UserProfile"));
const CreationDetail = lazy(() => import("./pages/community/CreationDetail"));
const Setup = lazy(() => import("./pages/community/Setup"));
const Me = lazy(() => import("./pages/community/Me"));
const Projects = lazy(() => import("./pages/community/Projects"));
const Settings = lazy(() => import("./pages/community/Settings"));
const Moderation = lazy(() => import("./pages/community/Moderation"));
const CommunityGuidelines = lazy(
  () => import("./pages/community/CommunityGuidelines"),
);
const Copyright = lazy(() => import("./pages/community/Copyright"));
const Security = lazy(() => import("./pages/community/Security"));

function OnboardedAccountRoute({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  if (
    status === "authenticated" &&
    user &&
    (!user.username || user.termsAccepted !== true)
  ) {
    return (
      <Redirect to={setupPathForReturnTo(currentRelativeReturnTo())} replace />
    );
  }
  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/studio"} component={Studio} />
      <Route path={"/discover"} component={Discover} />
      <Route path={"/search"} component={Search} />
      <Route path={"/u/:username"} component={UserProfile} />
      <Route path={"/creation/:slug"} component={CreationDetail} />
      <Route path={"/me/setup"} component={Setup} />
      <Route path={"/me/projects"}>
        <OnboardedAccountRoute>
          <Projects />
        </OnboardedAccountRoute>
      </Route>
      <Route path={"/me/settings"}>
        <Settings />
      </Route>
      <Route path={"/me"}>
        <OnboardedAccountRoute>
          <Me />
        </OnboardedAccountRoute>
      </Route>
      <Route path={"/moderation"}>
        <OnboardedAccountRoute>
          <Moderation />
        </OnboardedAccountRoute>
      </Route>
      <Route path={"/community-guidelines"} component={CommunityGuidelines} />
      <Route path={"/copyright"} component={Copyright} />
      <Route path={"/security"} component={Security} />
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
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Suspense
              fallback={
                <div
                  className="flex min-h-screen items-center justify-center bg-[var(--island-paper)] px-6 text-center text-sm font-bold text-[var(--island-ink)]/60"
                  role="status"
                >
                  Opening the workshop…
                </div>
              }
            >
              <Router />
            </Suspense>
            <AnalyticsLoader />
            <CookieConsent />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
