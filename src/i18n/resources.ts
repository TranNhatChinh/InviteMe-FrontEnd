import type { Resource } from "i18next";
import viCommon from "./locales/vi/common.json";
import enCommon from "./locales/en/common.json";
import viNavigation from "./locales/vi/navigation.json";
import enNavigation from "./locales/en/navigation.json";
import viSettings from "./locales/vi/settings.json";
import enSettings from "./locales/en/settings.json";
import viAuth from "./locales/vi/auth.json";
import enAuth from "./locales/en/auth.json";
import viDashboard from "./locales/vi/dashboard.json";
import enDashboard from "./locales/en/dashboard.json";
import viPublic from "./locales/vi/public.json";
import enPublic from "./locales/en/public.json";
import viLanding from "./locales/vi/landing.json";
import enLanding from "./locales/en/landing.json";
import viScreens from "./locales/vi/screens.json";
import enScreens from "./locales/en/screens.json";
import viWeddings from "./locales/vi/weddings.json";
import enWeddings from "./locales/en/weddings.json";
import viAdmin from "./locales/vi/admin.json";
import enAdmin from "./locales/en/admin.json";
import viGuests from "./locales/vi/guests.json";
import enGuests from "./locales/en/guests.json";
import viAudit from "./locales/vi/audit.json";
import enAudit from "./locales/en/audit.json";
import viGifts from "./locales/vi/gifts.json";
import enGifts from "./locales/en/gifts.json";
import viCohost from "./locales/vi/cohost.json";
import enCohost from "./locales/en/cohost.json";
import viInvitations from "./locales/vi/invitations.json";
import enInvitations from "./locales/en/invitations.json";
import viThankYou from "./locales/vi/thankYou.json";
import enThankYou from "./locales/en/thankYou.json";
import viGuestPlanning from "./locales/vi/guestPlanning.json";
import enGuestPlanning from "./locales/en/guestPlanning.json";
import viTemplateStudio from "./locales/vi/templateStudio.json";
import enTemplateStudio from "./locales/en/templateStudio.json";
import viSeating from "./locales/vi/seating.json";
import enSeating from "./locales/en/seating.json";
import viGuestTools from "./locales/vi/guestTools.json";
import enGuestTools from "./locales/en/guestTools.json";
import viPlans from "./locales/vi/plans.json";
import enPlans from "./locales/en/plans.json";
import viWeddingEditor from "./locales/vi/weddingEditor.json";
import enWeddingEditor from "./locales/en/weddingEditor.json";
import viUi from "./locales/vi/ui.json";
import enUi from "./locales/en/ui.json";

export const resources = {
  vi: {
    common: viCommon,
    navigation: viNavigation,
    settings: viSettings,
    auth: viAuth,
    dashboard: viDashboard,
    public: viPublic,
    landing: viLanding,
    screens: viScreens,
    weddings: viWeddings,
    admin: viAdmin,
    guests: viGuests,
    audit: viAudit,
    gifts: viGifts,
    cohost: viCohost,
    invitations: viInvitations,
    thankYou: viThankYou,
    guestPlanning: viGuestPlanning,
    templateStudio: viTemplateStudio,
    seating: viSeating,
    guestTools: viGuestTools,
    plans: viPlans,
    weddingEditor: viWeddingEditor,
    ui: viUi,
  },
  en: {
    common: enCommon,
    navigation: enNavigation,
    settings: enSettings,
    auth: enAuth,
    dashboard: enDashboard,
    public: enPublic,
    landing: enLanding,
    screens: enScreens,
    weddings: enWeddings,
    admin: enAdmin,
    guests: enGuests,
    audit: enAudit,
    gifts: enGifts,
    cohost: enCohost,
    invitations: enInvitations,
    thankYou: enThankYou,
    guestPlanning: enGuestPlanning,
    templateStudio: enTemplateStudio,
    seating: enSeating,
    guestTools: enGuestTools,
    plans: enPlans,
    weddingEditor: enWeddingEditor,
    ui: enUi,
  },
} satisfies Resource;

export const namespaces = [
  "common",
  "navigation",
  "settings",
  "auth",
  "dashboard",
  "public",
  "landing",
  "screens",
  "weddings",
  "admin",
  "guests",
  "audit",
  "gifts",
  "cohost",
  "invitations",
  "thankYou",
  "guestPlanning",
  "templateStudio",
  "seating",
  "guestTools",
  "plans",
  "weddingEditor",
  "ui",
] as const;
