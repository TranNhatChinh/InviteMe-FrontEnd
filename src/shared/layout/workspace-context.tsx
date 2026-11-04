"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

export type WorkspaceWedding = {
  id: string;
  name: string;
  status: string;
  href?: string;
};

export type WorkspaceNavigationIcon =
  | "dashboard"
  | "calendar"
  | "users"
  | "weddings"
  | "templates"
  | "permissions"
  | "audit"
  | "plans"
  | "overview"
  | "website"
  | "invitations"
  | "rsvp"
  | "reminders"
  | "waitlist"
  | "seating"
  | "checkin"
  | "gifts"
  | "thank-you"
  | "analytics"
  | "co-hosts"
  | "settings"
  | "account";

export type WorkspaceSidebarItem = {
  href: string;
  label: string;
  icon: WorkspaceNavigationIcon;
  locked?: boolean;
};

export type WorkspaceSidebarGroup = {
  label: string;
  items: WorkspaceSidebarItem[];
};

export type WeddingSidebarNavigation = {
  weddingId: string;
  groups: WorkspaceSidebarGroup[];
};

type WorkspaceContextValue = {
  wedding: WorkspaceWedding | null;
  setWedding: (
    value:
      WorkspaceWedding | null | ((current: WorkspaceWedding | null) => WorkspaceWedding | null),
  ) => void;
  weddingNavigation: WeddingSidebarNavigation | null;
  setWeddingNavigation: (
    value:
      | WeddingSidebarNavigation
      | null
      | ((current: WeddingSidebarNavigation | null) => WeddingSidebarNavigation | null),
  ) => void;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceContextProvider({ children }: { children: ReactNode }) {
  const [wedding, setWeddingState] = useState<WorkspaceWedding | null>(null);
  const [weddingNavigation, setWeddingNavigationState] = useState<WeddingSidebarNavigation | null>(
    null,
  );
  const setWedding = useCallback<WorkspaceContextValue["setWedding"]>((value) => {
    setWeddingState((current) => (typeof value === "function" ? value(current) : value));
  }, []);
  const setWeddingNavigation = useCallback<WorkspaceContextValue["setWeddingNavigation"]>(
    (value) => {
      setWeddingNavigationState((current) =>
        typeof value === "function" ? value(current) : value,
      );
    },
    [],
  );

  return (
    <WorkspaceContext.Provider
      value={{ wedding, setWedding, weddingNavigation, setWeddingNavigation }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspaceContext() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("useWorkspaceContext must be used inside DashboardShell.");
  return context;
}
