import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import { App } from "./pages/App";
import { EventsPage } from "./pages/EventsPage";
import { ActivationsPage } from "./pages/ActivationsPage";
import { VenuesPage } from "./pages/VenuesPage";
import "@fortawesome/fontawesome-free/css/all.min.css";
import "./styles/globals.css";

function normalizePathname(pathname: string) {
  if (!pathname || pathname === "/") return "/events";
  return pathname;
}

function RouterShell() {
  const [pathname, setPathname] = useState(() => normalizePathname(window.location.pathname));

  useEffect(() => {
    if (window.location.pathname === "/") {
      window.history.replaceState({}, "", "/events");
      setPathname("/events");
    }
    const onPop = () => setPathname(normalizePathname(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function navigate(nextPath: string) {
    const normalized = normalizePathname(nextPath);
    if (normalized === window.location.pathname) {
      setPathname(normalized);
      return;
    }
    window.history.pushState({}, "", normalized);
    setPathname(normalized);
  }

  const route = useMemo(() => {
    if (pathname === "/activations") {
      return { type: "activations" as const };
    }
    if (pathname === "/venues") {
      return { type: "venues" as const };
    }
    const cuesheetMatch = pathname.match(/^\/events\/([^/]+)$/);
    if (cuesheetMatch) {
      return { type: "cuesheet" as const, eventId: cuesheetMatch[1] };
    }
    return { type: "events" as const };
  }, [pathname]);

  if (route.type === "cuesheet") {
    return <App eventId={route.eventId} onNavigate={navigate} />;
  }

  if (route.type === "venues") {
    return <VenuesPage onNavigate={navigate} />;
  }

  if (route.type === "activations") {
    return <ActivationsPage onNavigate={navigate} />;
  }

  return <EventsPage onNavigate={navigate} />;
}

ReactDOM.createRoot(document.getElementById("app") as HTMLElement).render(
  <React.StrictMode>
    <RouterShell />
  </React.StrictMode>,
);
