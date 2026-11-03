"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CircleCheck,
  CircleDashed,
  ChevronDown,
  Search,
  UserRoundCheck,
  UserPlus,
  UserRound,
  X,
} from "lucide-react";
import { ApiError } from "@/core/api/api-error";
import { useRuntime } from "@/core/config/runtime";
import { ConfirmDialog } from "@/shared/feedback/confirm-dialog";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { useLocale } from "@/i18n/language-context";
import {
  addReceptionWalkIn,
  checkInGuestPlaces,
  lookupGuestSeats,
  searchReceptionGuests,
  type ReceptionGuest,
  type CheckInResult,
  type SeatLookup,
  type WalkInInput,
} from "../api/seat-lookup.api";
import { QrCameraScanner } from "./qr-camera-scanner";

type CheckInOutcome = CheckInResult["places"][number]["result"];
type CounterDisplayResult = {
  recipientName: string;
  honorific: string | null;
  places: CheckInResult["places"];
  walkIn: boolean;
  overCapacity: boolean;
};

const COUNTER_DISPLAY_SECONDS = 8;

function apiErrorMessage(
  error: unknown,
  action: "lookup" | "check-in" | "search" | "walk-in",
  t: (key: string) => string,
) {
  const actionKey = action.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
  if (!(error instanceof ApiError)) return t(`reception.errors.${actionKey}.network`);
  if (error.status === 401) return t("reception.errors.unauthenticated");
  if (error.status === 403) return t("reception.errors.forbidden");
  if (error.status === 404) return t("reception.errors.notFound");
  if (error.backendCode === "CHECKIN_EXCEPTION_REASON_REQUIRED")
    return t("reception.errors.exceptionRequired");
  if (error.backendCode === "PLACE_NOT_IN_INVITATION") return t("reception.errors.placeChanged");
  if (error.backendCode === "WALK_IN_OVER_CAPACITY") return t("reception.errors.overCapacity");
  if (error.backendCode === "IDEMPOTENCY_KEY_REUSED")
    return t("reception.errors.idempotencyConflict");
  if (error.status === 400) {
    if (action === "search") return t("reception.errors.searchQuery");
    if (action === "lookup") return t("reception.errors.invalidCode");
    return t(`reception.errors.${actionKey}.generic`);
  }
  if (error.status === 429) return t("reception.errors.rateLimited");
  if (error.status === 409) return t("reception.errors.conflict");
  if (error.status === 422) return t("reception.errors.invalidState");
  return t(`reception.errors.${actionKey}.generic`);
}

function attendanceLabel(
  seat: SeatLookup["seats"][number],
  latestOutcome: CheckInOutcome | undefined,
  t: (key: string) => string,
) {
  if (latestOutcome === "CHECKED_IN") return t("reception.status.checkedIn");
  if (latestOutcome === "ALREADY_CHECKED_IN" || seat.checkedInAt)
    return t("reception.status.alreadyCheckedIn");
  return t("reception.status.notCheckedIn");
}

function friendlyTime(value: string, language: "vi" | "en") {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat(language === "en" ? "en-US" : "vi-VN", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(date);
}

export function SeatLookupCounter({ weddingId }: { weddingId: string }) {
  const { t } = useTranslation("guests");
  const { language } = useLocale();
  const { api, realtime } = useRuntime();
  const [mode, setMode] = useState<"QR" | "SEARCH" | "WALK_IN">("QR");
  const [code, setCode] = useState("");
  const [lookupCode, setLookupCode] = useState<string | null>(null);
  const [guest, setGuest] = useState<SeatLookup | ReceptionGuest | null>(null);
  const [searchText, setSearchText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ReceptionGuest[]>([]);
  const [searchPending, setSearchPending] = useState(false);
  const [activeSearchQuery, setActiveSearchQuery] = useState<string | null>(null);
  const [walkInGuestId, setWalkInGuestId] = useState<string | null>(null);
  const [walkInName, setWalkInName] = useState("");
  const [walkInHonorific, setWalkInHonorific] = useState("");
  const [walkInSide, setWalkInSide] = useState<NonNullable<WalkInInput["side"]>>("UNSPECIFIED");
  const [walkInPeople, setWalkInPeople] = useState("1");
  const [walkInNames, setWalkInNames] = useState("");
  const [walkInReason, setWalkInReason] = useState("");
  const [showWalkInDetails, setShowWalkInDetails] = useState(false);
  const [walkInPending, setWalkInPending] = useState(false);
  const walkInAttempt = useRef<{ signature: string; key: string } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [outcomes, setOutcomes] = useState<Record<string, CheckInOutcome>>({});
  const [exceptionReason, setExceptionReason] = useState("");
  const [lookupPending, setLookupPending] = useState(false);
  const [checkInPending, setCheckInPending] = useState(false);
  const [counterDisplay, setCounterDisplay] = useState<CounterDisplayResult | null>(null);
  const [returnCountdown, setReturnCountdown] = useState(COUNTER_DISPLAY_SECONDS);
  const [resumeCameraOnReturn, setResumeCameraOnReturn] = useState(false);
  const [autoStartCamera, setAutoStartCamera] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const guestHeading = useRef<HTMLHeadingElement>(null);
  const modeTabs = useRef<Array<HTMLButtonElement | null>>([]);
  const displayHeading = useRef<HTMLHeadingElement>(null);
  const lookupBusy = useRef(false);

  const returnToScanner = useCallback(() => {
    setCounterDisplay(null);
    setReturnCountdown(COUNTER_DISPLAY_SECONDS);
    setMode("QR");
    setCode("");
    setLookupCode(null);
    setGuest(null);
    setSearchText("");
    setSearchQuery("");
    setSearchResults([]);
    setActiveSearchQuery(null);
    setWalkInGuestId(null);
    setSelectedIds([]);
    setOutcomes({});
    setExceptionReason("");
    setError("");
    setMessage("");
    setForbidden(false);
    setAutoStartCamera(resumeCameraOnReturn);
    setResumeCameraOnReturn(false);
    window.setTimeout(() => input.current?.focus(), 0);
  }, [resumeCameraOnReturn]);

  useEffect(() => {
    if (!counterDisplay) return;
    displayHeading.current?.focus();
    const countdown = window.setInterval(() => {
      setReturnCountdown((current) => Math.max(0, current - 1));
    }, 1000);
    const returnTimer = window.setTimeout(returnToScanner, COUNTER_DISPLAY_SECONDS * 1000);
    return () => {
      window.clearInterval(countdown);
      window.clearTimeout(returnTimer);
    };
  }, [counterDisplay, returnToScanner]);

  useEffect(() => input.current?.focus(), []);

  const reloadCurrentGuestSnapshot = useCallback(async () => {
    if (!guest || lookupBusy.current) return;
    try {
      const latest = lookupCode
        ? await lookupGuestSeats(api, weddingId, lookupCode)
        : activeSearchQuery
          ? (await searchReceptionGuests(api, weddingId, activeSearchQuery)).find(
              (item) => item.guestId === guest.guestId,
            )
          : undefined;
      if (!latest || latest.guestId !== guest.guestId) return;
      const checkedInIds = new Set(
        latest.seats.filter((seat) => seat.checkedInAt).map((seat) => seat.placeId),
      );
      const staleSelectionCount = selectedIds.filter((id) => checkedInIds.has(id)).length;
      setGuest(latest);
      setOutcomes({});
      setSelectedIds((current) => current.filter((id) => !checkedInIds.has(id)));
      if (staleSelectionCount > 0) {
        setMessage(t("reception.realtimeGuestUpdated", { count: staleSelectionCount }));
      }
    } catch {
      // The current screen remains usable; a fresh lookup can be requested manually.
    }
  }, [activeSearchQuery, api, guest, lookupCode, selectedIds, t, weddingId]);

  useEffect(() => {
    const unsubscribe = realtime.onPlanningChange((change) => {
      if (
        (change.type === "GuestCheckedIn" || change.type === "GuestCheckInVoided") &&
        change.entityId === guest?.guestId
      ) {
        void reloadCurrentGuestSnapshot();
      }
    });
    const unsubscribeResync = realtime.onResync(() => void reloadCurrentGuestSnapshot());
    return () => {
      unsubscribe();
      unsubscribeResync();
    };
  }, [guest?.guestId, realtime, reloadCurrentGuestSnapshot]);

  async function findGuest(value: string) {
    const normalized = value.trim();
    if (!normalized || lookupBusy.current || checkInPending) return;
    if (normalized.length > 2048) {
      setError(t("reception.errors.codeTooLong"));
      return;
    }
    lookupBusy.current = true;
    setLookupPending(true);
    setGuest(null);
    setLookupCode(null);
    setActiveSearchQuery(null);
    setSelectedIds([]);
    setOutcomes({});
    setExceptionReason("");
    setError("");
    setMessage("");
    setForbidden(false);
    try {
      const result = await lookupGuestSeats(api, weddingId, normalized);
      setGuest(result);
      setLookupCode(normalized);
      setActiveSearchQuery(null);
      setMessage(t("reception.lookupOnly"));
      setCode("");
    } catch (cause) {
      setError(apiErrorMessage(cause, "lookup", t));
      if (cause instanceof ApiError && cause.status === 403) setForbidden(true);
    } finally {
      lookupBusy.current = false;
      setLookupPending(false);
      input.current?.focus();
    }
  }

  function submitLookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResumeCameraOnReturn(false);
    void findGuest(code);
  }

  function togglePlace(placeId: string, checked: boolean) {
    setSelectedIds((current) =>
      checked ? [...current, placeId] : current.filter((item) => item !== placeId),
    );
  }

  async function confirmCheckIn() {
    if (
      !guest ||
      (!lookupCode && !("guestId" in guest)) ||
      selectedIds.length === 0 ||
      checkInPending
    )
      return;
    const selectedUnused = guest.seats.some(
      (seat) => selectedIds.includes(seat.placeId) && seat.status === "UNUSED",
    );
    const reason = exceptionReason.trim();
    if (selectedUnused && !reason) {
      setError(t("reception.errors.exceptionRequired"));
      return;
    }

    setCheckInPending(true);
    setError("");
    setMessage("");
    setForbidden(false);
    try {
      const result = await checkInGuestPlaces(
        api,
        weddingId,
        lookupCode ? { code: lookupCode } : { guestId: guest.guestId },
        selectedIds,
        selectedUnused ? reason : undefined,
      );
      setCounterDisplay({
        recipientName: result.recipientName,
        honorific: result.honorific,
        places: result.places,
        walkIn: false,
        overCapacity: false,
      });
      setReturnCountdown(COUNTER_DISPLAY_SECONDS);
      const resultById = Object.fromEntries(
        result.places.map((place) => [place.placeId, place.result]),
      ) as Record<string, CheckInOutcome>;
      setOutcomes((current) => ({ ...current, ...resultById }));
      setGuest((current) =>
        current
          ? {
              ...current,
              seats: current.seats.map((seat) => {
                const place = result.places.find((item) => item.placeId === seat.placeId);
                return place
                  ? { ...seat, checkedInAt: place.checkedInAt, checkInKind: place.kind }
                  : seat;
              }),
            }
          : current,
      );
      setSelectedIds([]);
      setExceptionReason("");
      const newlyChecked = result.places.filter((place) => place.result === "CHECKED_IN").length;
      const alreadyDone = result.places.length - newlyChecked;
      setMessage(
        alreadyDone > 0
          ? t("reception.checkInSummary", { newly: newlyChecked, already: alreadyDone })
          : t("reception.checkInSuccess", { count: newlyChecked }),
      );
    } catch (cause) {
      setError(apiErrorMessage(cause, "check-in", t));
      if (cause instanceof ApiError && cause.status === 403) setForbidden(true);
      if (cause instanceof ApiError && cause.status === 409) {
        await reloadCurrentGuestSnapshot();
      }
    } finally {
      setCheckInPending(false);
    }
  }

  async function findReceptionGuests(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = searchText.trim();
    if (query.length < 2 || searchPending || checkInPending || walkInPending) return;
    setSearchPending(true);
    setSearchQuery(query);
    setSearchResults([]);
    setGuest(null);
    setLookupCode(null);
    setActiveSearchQuery(null);
    setSelectedIds([]);
    setOutcomes({});
    setError("");
    setMessage("");
    setForbidden(false);
    try {
      const result = await searchReceptionGuests(api, weddingId, query);
      setSearchResults(result);
      setMessage(
        result.length
          ? t("reception.searchResults", { count: result.length })
          : t("reception.noSearchResults"),
      );
    } catch (cause) {
      setError(apiErrorMessage(cause, "search", t));
      if (cause instanceof ApiError && cause.status === 403) setForbidden(true);
    } finally {
      setSearchPending(false);
    }
  }

  function selectReceptionGuest(result: ReceptionGuest) {
    setGuest(result);
    setLookupCode(null);
    setActiveSearchQuery(searchQuery);
    setSelectedIds([]);
    setOutcomes({});
    setError("");
    setMessage(t("reception.guestSelected"));
    setForbidden(false);
    window.setTimeout(() => guestHeading.current?.focus(), 0);
  }

  function startCompanionWalkIn(result: ReceptionGuest) {
    setWalkInGuestId(result.guestId);
    setWalkInName("");
    setWalkInHonorific("");
    setWalkInSide("UNSPECIFIED");
    setWalkInPeople("1");
    setWalkInNames("");
    setWalkInReason("");
    setShowWalkInDetails(false);
    setError("");
    setMode("WALK_IN");
  }

  async function submitWalkIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const people = Number(walkInPeople);
    const recipientName = walkInName.trim();
    const names = walkInNames
      .split(/\r?\n/)
      .map((name) => name.trim())
      .filter(Boolean);
    if (!Number.isInteger(people) || people < 1 || people > 20) {
      setError(t("reception.errors.walkInCount"));
      return;
    }
    if (!walkInGuestId && !recipientName) {
      setError(t("reception.errors.walkInName"));
      return;
    }
    if (names.length > (walkInGuestId ? people : people - 1)) {
      setError(
        walkInGuestId
          ? t("reception.errors.companionNameCount")
          : t("reception.errors.walkInNameCount"),
      );
      return;
    }
    const input: WalkInInput = {
      guestId: walkInGuestId,
      recipientName: walkInGuestId ? null : recipientName,
      people,
      honorific: walkInGuestId ? null : walkInHonorific.trim() || null,
      side: walkInGuestId ? null : walkInSide,
      names: names.length ? names : null,
      overrideReason: walkInReason.trim() || null,
    };
    const signature = JSON.stringify(input);
    if (!walkInAttempt.current || walkInAttempt.current.signature !== signature) {
      walkInAttempt.current = { signature, key: crypto.randomUUID() };
    }

    setWalkInPending(true);
    setError("");
    setMessage("");
    setForbidden(false);
    try {
      const result = await addReceptionWalkIn(api, weddingId, input, walkInAttempt.current.key);
      walkInAttempt.current = null;
      setCounterDisplay({
        recipientName: result.recipientName,
        honorific: result.honorific,
        places: result.places,
        walkIn: true,
        overCapacity: result.overCapacity,
      });
      setReturnCountdown(COUNTER_DISPLAY_SECONDS);
      const seats = result.places.map((place) => ({
        placeId: place.placeId,
        position: place.position,
        participantId: null,
        personName: place.personName,
        status: place.status,
        table: place.table,
        seatNumber: place.seatNumber,
        checkedInAt: place.checkedInAt,
        checkInKind: place.kind,
      }));
      const walkInGuest: ReceptionGuest = {
        guestId: result.guestId,
        recipientName: result.recipientName,
        honorific: result.honorific,
        side: walkInSide,
        places: seats.length,
        checkedIn: seats.length,
        tables: [...new Set(seats.flatMap((seat) => (seat.table ? [seat.table] : [])))],
        seats,
      };
      setGuest(walkInGuest);
      setLookupCode(null);
      setActiveSearchQuery(null);
      setSelectedIds([]);
      setOutcomes(Object.fromEntries(result.places.map((place) => [place.placeId, place.result])));
      setMessage(
        result.newGuest
          ? t(
              result.overCapacity
                ? "reception.walkInCreatedOverCapacity"
                : "reception.walkInCreated",
              { count: result.places.length },
            )
          : t("reception.companionsAdded", { count: result.places.length }),
      );
    } catch (cause) {
      setError(apiErrorMessage(cause, "walk-in", t));
      if (cause instanceof ApiError && cause.status === 403) setForbidden(true);
      if (cause instanceof ApiError && cause.backendCode === "WALK_IN_OVER_CAPACITY") {
        setShowWalkInDetails(true);
      }
    } finally {
      setWalkInPending(false);
    }
  }

  const selectedUnused =
    guest?.seats.some((seat) => selectedIds.includes(seat.placeId) && seat.status === "UNUSED") ??
    false;

  if (counterDisplay) {
    const newlyCheckedIn = counterDisplay.places.filter(
      (place) => place.result === "CHECKED_IN",
    ).length;
    const previouslyCheckedIn = counterDisplay.places.length - newlyCheckedIn;
    const allAlreadyCheckedIn = newlyCheckedIn === 0 && previouslyCheckedIn > 0;

    return (
      <section
        aria-labelledby="counter-result-heading"
        role="region"
        className="fixed inset-0 z-[100] grid overflow-y-auto bg-background p-4 text-foreground sm:p-8"
      >
        <div className="m-auto w-full max-w-4xl space-y-5 text-center sm:space-y-7">
          <div
            className={`mx-auto grid size-16 place-items-center rounded-full sm:size-20 ${allAlreadyCheckedIn ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}
          >
            {allAlreadyCheckedIn ? (
              <AlertCircle className="size-12 sm:size-16" aria-hidden="true" />
            ) : (
              <CircleCheck className="size-12 sm:size-16" aria-hidden="true" />
            )}
          </div>
          <div className="space-y-3">
            <p
              className={`text-sm font-semibold ${allAlreadyCheckedIn ? "text-amber-800" : "text-emerald-800"}`}
            >
              {allAlreadyCheckedIn
                ? t("reception.resultAlreadyCheckedIn")
                : counterDisplay.walkIn
                  ? t("reception.resultWalkIn")
                  : t("reception.resultSuccess")}
            </p>
            <h1
              ref={displayHeading}
              id="counter-result-heading"
              tabIndex={-1}
              className="text-2xl font-semibold leading-tight tracking-tight outline-none sm:text-4xl"
            >
              {counterDisplay.honorific ? `${counterDisplay.honorific} ` : ""}
              {counterDisplay.recipientName}
            </h1>
            <p className="text-base text-muted-foreground sm:text-lg">
              {newlyCheckedIn > 0
                ? t("reception.resultCounts", {
                    newly: newlyCheckedIn,
                    already: previouslyCheckedIn,
                  })
                : t("reception.resultAlreadyCount", { count: previouslyCheckedIn })}
            </p>
          </div>

          <ul
            aria-label={t("reception.resultList")}
            className="mx-auto grid max-w-4xl gap-3 text-left sm:grid-cols-2"
          >
            {counterDisplay.places.map((place) => {
              const alreadyCheckedIn = place.result === "ALREADY_CHECKED_IN";
              return (
                <li
                  key={place.placeId}
                  className={`flex min-h-20 items-center justify-between gap-3 rounded-xl border bg-card p-3 text-left sm:p-4 ${alreadyCheckedIn ? "border-amber-300 bg-amber-50" : "border-emerald-200 bg-emerald-50/60"}`}
                >
                  <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                    {alreadyCheckedIn ? (
                      <AlertCircle
                        className="size-6 shrink-0 text-amber-800 sm:size-7"
                        aria-hidden="true"
                      />
                    ) : (
                      <CircleCheck
                        className="size-6 shrink-0 text-emerald-800 sm:size-7"
                        aria-hidden="true"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="break-words text-base font-semibold sm:text-lg">
                        {place.personName ?? t("guestNumber", { number: place.position })}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {alreadyCheckedIn
                          ? t("reception.status.alreadyCheckedIn")
                          : t("reception.status.justCheckedIn")}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs font-medium text-muted-foreground">
                      {t("reception.tableNumber")}
                    </p>
                    <p className="mt-1 text-lg font-semibold sm:text-xl">
                      {place.table ?? t("reception.notAssigned")}
                    </p>
                    {place.table && place.seatNumber !== null && (
                      <p className="text-sm text-muted-foreground">
                        {t("reception.seatNumber", { number: place.seatNumber })}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {counterDisplay.overCapacity && (
            <p className="mx-auto max-w-3xl rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
              {t("reception.overCapacityAccepted")}
            </p>
          )}

          <div className="space-y-3 pt-2">
            <Button
              type="button"
              onClick={returnToScanner}
              className="h-12 min-w-56 px-8 text-base font-semibold"
            >
              {t("reception.nextGuest")}
            </Button>
            <p aria-live="off" className="text-sm text-muted-foreground">
              {t("reception.returnCountdown", { count: returnCountdown })}
            </p>
          </div>
        </div>
      </section>
    );
  }

  const selectedPeople =
    guest?.seats
      .filter((seat) => selectedIds.includes(seat.placeId))
      .map((seat) => seat.personName ?? t("guestNumber", { number: seat.position })) ?? [];
  const selectedNames =
    selectedPeople.length > 3
      ? selectedPeople.slice(0, 3).join(", ") +
        " " +
        t("reception.andMore", { count: selectedPeople.length - 3 })
      : selectedPeople.join(", ");

  function renderCheckInConfirmation(buttonClassName: string) {
    return (
      <ConfirmDialog
        trigger={
          <Button
            type="button"
            className={buttonClassName}
            disabled={
              selectedIds.length === 0 ||
              checkInPending ||
              (selectedUnused && !exceptionReason.trim())
            }
          >
            <Check aria-hidden="true" />
            {checkInPending
              ? t("reception.recording")
              : t("reception.confirmCheckInCount", { count: selectedIds.length })}
          </Button>
        }
        title={t("reception.confirmTitle")}
        description={t("reception.confirmNamedDescription", {
          names: selectedNames,
          count: selectedIds.length,
        })}
        cancelLabel={t("reception.goBack")}
        confirmLabel={t("reception.recordCheckIn")}
        onConfirm={() => void confirmCheckIn()}
      />
    );
  }

  return (
    <section className="mx-auto max-w-5xl space-y-5 pb-28 sm:space-y-6 sm:pb-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {t("reception.title")}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">{t("reception.description")}</p>
      </header>

      <div className="space-y-5 rounded-2xl border bg-card p-4 sm:p-6">
        <div
          role="tablist"
          aria-label={t("reception.modesLabel")}
          className="grid grid-cols-3 gap-1 rounded-xl bg-muted/70 p-1"
        >
          {(
            [
              ["QR", t("reception.scanQr")],
              ["SEARCH", t("reception.searchGuest")],
              ["WALK_IN", t("reception.walkIn")],
            ] as const
          ).map(([value, label], index) => (
            <button
              key={value}
              ref={(element) => {
                modeTabs.current[index] = element;
              }}
              id={"check-in-tab-" + value.toLowerCase()}
              type="button"
              role="tab"
              aria-selected={mode === value}
              tabIndex={mode === value ? 0 : -1}
              onKeyDown={(event) => {
                const currentIndex = index;
                let nextIndex = currentIndex;
                if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % 3;
                else if (event.key === "ArrowLeft") nextIndex = (currentIndex + 2) % 3;
                else if (event.key === "Home") nextIndex = 0;
                else if (event.key === "End") nextIndex = 2;
                else return;
                event.preventDefault();
                const nextMode = (["QR", "SEARCH", "WALK_IN"] as const)[nextIndex];
                if (!nextMode) return;
                setMode(nextMode);
                setError("");
                setMessage("");
                setResumeCameraOnReturn(false);
                setAutoStartCamera(false);
                modeTabs.current[nextIndex]?.focus();
              }}
              onClick={() => {
                setMode(value);
                setError("");
                setMessage("");
                setResumeCameraOnReturn(false);
                setAutoStartCamera(false);
              }}
              className={
                "min-h-11 rounded-lg px-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 " +
                (mode === value
                  ? "bg-background text-foreground"
                  : "text-muted-foreground hover:bg-background/70 hover:text-foreground")
              }
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "QR" && (
          <div
            id="check-in-panel-qr"
            role="tabpanel"
            aria-labelledby="check-in-tab-qr"
            className="space-y-4 outline-none"
          >
            <QrCameraScanner
              disabled={lookupPending || checkInPending}
              autoStart={autoStartCamera}
              onDetected={(value) => {
                setResumeCameraOnReturn(true);
                setCode(value);
                void findGuest(value);
              }}
            />
            <form onSubmit={submitLookup} className="flex flex-col gap-3 sm:flex-row">
              <Input
                ref={input}
                value={code}
                onChange={(event) => setCode(event.target.value)}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                aria-label={t("reception.codeLabel")}
                placeholder={t("reception.codePlaceholder")}
                className="h-12 min-w-0 flex-1"
                disabled={lookupPending || checkInPending}
              />
              <Button
                type="submit"
                disabled={!code.trim() || lookupPending || checkInPending}
                className="h-12 sm:min-w-36"
              >
                <Search aria-hidden="true" />
                {lookupPending ? t("reception.lookupPending") : t("reception.lookup")}
              </Button>
            </form>
            <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-foreground">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              <p>{t("reception.lookupHint")}</p>
            </div>
          </div>
        )}

        {mode === "SEARCH" && (
          <div
            id="check-in-panel-search"
            role="tabpanel"
            aria-labelledby="check-in-tab-search"
            className="space-y-4 outline-none"
          >
            <form onSubmit={findReceptionGuests} className="flex items-center gap-2">
              <Input
                ref={searchInput}
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                autoComplete="off"
                aria-label={t("reception.searchLabel")}
                placeholder={t("reception.searchPlaceholder")}
                aria-describedby="check-in-search-hint"
                className="h-12 min-w-0 flex-1"
                disabled={searchPending || checkInPending}
              />
              <Button
                type="button"
                variant="ghost"
                aria-label={t("reception.clearSearch")}
                disabled={!searchText || searchPending || checkInPending}
                onClick={() => {
                  setSearchText("");
                  setSearchQuery("");
                  setSearchResults([]);
                  setGuest(null);
                  setSelectedIds([]);
                  setOutcomes({});
                  setActiveSearchQuery(null);
                  setExceptionReason("");
                  setError("");
                  setForbidden(false);
                  searchInput.current?.focus();
                }}
                className="size-12 shrink-0 px-0"
              >
                <X aria-hidden="true" />
              </Button>
              <Button
                type="submit"
                disabled={searchText.trim().length < 2 || searchPending || checkInPending}
                className="h-12 shrink-0 px-3 sm:min-w-36"
              >
                <Search aria-hidden="true" />
                <span className="hidden sm:inline">
                  {searchPending ? t("reception.searching") : t("reception.search")}
                </span>
                <span className="sr-only sm:hidden">{t("reception.search")}</span>
              </Button>
            </form>
            <p id="check-in-search-hint" className="text-xs text-muted-foreground">
              {t("reception.searchMinChars")}
            </p>
            {searchResults.length > 0 && !guest && (
              <>
                <p className="text-sm font-medium">
                  {t("reception.searchResults", { count: searchResults.length })}
                </p>
                <ul className="space-y-2" aria-label={t("reception.searchResultsLabel")}>
                  {searchResults.map((result) => (
                    <li
                      key={result.guestId}
                      className="flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4"
                    >
                      <div className="min-w-0">
                        <p className="break-words font-semibold">
                          {result.honorific ? result.honorific + " " : ""}
                          {result.recipientName}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {t("planning.sideValues." + result.side, { defaultValue: result.side })} ·{" "}
                          {t("reception.checkedInOfPlaces", {
                            checkedIn: result.checkedIn,
                            places: result.places,
                          })}{" "}
                          ·{" "}
                          {result.tables.length
                            ? result.tables.join(", ")
                            : t("reception.notAssigned")}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => selectReceptionGuest(result)}
                        >
                          <UserRoundCheck aria-hidden="true" />
                          {t("reception.selectForCheckIn")}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => startCompanionWalkIn(result)}
                        >
                          <UserPlus aria-hidden="true" />
                          {t("reception.addCompanion")}
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {searchQuery && !searchPending && searchResults.length === 0 && (
              <div className="rounded-xl border border-dashed p-4 text-sm">
                <p>{t("reception.noSearchMatchHint")}</p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3"
                  onClick={() => {
                    setWalkInGuestId(null);
                    setMode("WALK_IN");
                  }}
                >
                  {t("reception.createWalkIn")}
                </Button>
              </div>
            )}
          </div>
        )}

        {mode === "WALK_IN" && (
          <form
            id="check-in-panel-walk_in"
            role="tabpanel"
            aria-labelledby="check-in-tab-walk_in"
            onSubmit={submitWalkIn}
            className="space-y-4 outline-none"
          >
            <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-foreground">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              <p>{t("reception.walkInImmediateHint")}</p>
            </div>
            {walkInGuestId ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                <p className="text-sm">
                  {t("reception.addCompanionFor")}{" "}
                  <strong>
                    {searchResults.find((item) => item.guestId === walkInGuestId)?.recipientName ??
                      t("reception.selectedGuest")}
                  </strong>
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setWalkInGuestId(null)}
                >
                  {t("reception.createNewGuest")}
                </Button>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1 text-sm sm:col-span-2">
                  <span className="font-medium">
                    {t("reception.primaryGuestName")} <span aria-hidden="true">*</span>
                  </span>
                  <Input
                    value={walkInName}
                    onChange={(event) => setWalkInName(event.target.value)}
                    maxLength={150}
                    required
                    placeholder={t("reception.walkInNamePlaceholder")}
                    disabled={walkInPending}
                  />
                </label>
              </div>
            )}
            <div className="max-w-sm">
              <label className="space-y-1 text-sm">
                <span className="font-medium">
                  {walkInGuestId ? t("reception.companionCount") : t("reception.totalPeople")}
                </span>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  step={1}
                  value={walkInPeople}
                  onChange={(event) => setWalkInPeople(event.target.value)}
                  required
                  disabled={walkInPending}
                />
                <span className="block text-xs text-muted-foreground">
                  {walkInGuestId
                    ? t("reception.allCompanionsCheckedIn")
                    : t("reception.totalPeopleHint")}
                </span>
              </label>
            </div>
            <details
              open={showWalkInDetails || Boolean(walkInReason)}
              onToggle={(event) => setShowWalkInDetails(event.currentTarget.open)}
              className="group rounded-xl border"
            >
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
                <span>{t("reception.additionalDetails")}</span>
                <ChevronDown
                  className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <div className="grid gap-4 border-t p-4 sm:grid-cols-2">
                {!walkInGuestId && (
                  <>
                    <label className="space-y-1 text-sm">
                      <span className="font-medium">{t("reception.honorific")}</span>
                      <Input
                        value={walkInHonorific}
                        onChange={(event) => setWalkInHonorific(event.target.value)}
                        maxLength={50}
                        placeholder={t("reception.honorificPlaceholder")}
                        disabled={walkInPending}
                      />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="font-medium">{t("reception.sideGroup")}</span>
                      <select
                        value={walkInSide}
                        onChange={(event) =>
                          setWalkInSide(event.target.value as NonNullable<WalkInInput["side"]>)
                        }
                        disabled={walkInPending}
                        className="h-10 w-full rounded-lg border bg-background px-3"
                      >
                        <option value="UNSPECIFIED">{t("planning.sideValues.UNSPECIFIED")}</option>
                        <option value="BRIDE">{t("planning.sideValues.BRIDE")}</option>
                        <option value="GROOM">{t("planning.sideValues.GROOM")}</option>
                        <option value="MUTUAL">{t("planning.sideValues.MUTUAL")}</option>
                      </select>
                    </label>
                  </>
                )}
                <label className="space-y-1 text-sm sm:col-span-2">
                  <span className="font-medium">{t("reception.companionNames")}</span>
                  <textarea
                    value={walkInNames}
                    onChange={(event) => setWalkInNames(event.target.value)}
                    rows={2}
                    disabled={walkInPending}
                    placeholder={t("reception.companionNamesPlaceholder")}
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                  />
                </label>
                <label className="space-y-1 text-sm sm:col-span-2">
                  <span className="font-medium">{t("reception.capacityOverrideReason")}</span>
                  <Input
                    value={walkInReason}
                    onChange={(event) => setWalkInReason(event.target.value)}
                    maxLength={500}
                    disabled={walkInPending}
                    placeholder={t("reception.capacityOverridePlaceholder")}
                  />
                </label>
              </div>
            </details>
            <Button
              type="submit"
              className="h-12 w-full sm:w-auto"
              disabled={walkInPending || checkInPending}
            >
              <UserPlus aria-hidden="true" />
              {walkInPending
                ? t("reception.creatingAndCheckingIn")
                : walkInGuestId
                  ? t("reception.addAndCheckInCompanions")
                  : t("reception.createAndCheckInWalkIn")}
            </Button>
          </form>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className={`rounded-xl border p-4 text-sm ${forbidden ? "border-amber-300 bg-amber-50 text-amber-950" : "border-red-200 bg-red-50 text-red-900"}`}
        >
          {error}
          {forbidden && <p className="mt-1">{t("reception.checkInPermissionRequired")}</p>}
        </div>
      )}

      {guest && (
        <>
          <article className="space-y-5 rounded-2xl border bg-card p-4 sm:p-6">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div className="flex min-w-0 items-start gap-4">
                <div className="grid size-12 shrink-0 place-items-center rounded-full bg-muted text-foreground">
                  <UserRound aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-muted-foreground">{t("reception.guestLabel")}</p>
                  <h2
                    ref={guestHeading}
                    tabIndex={-1}
                    className="break-words text-xl font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-2xl"
                  >
                    {guest.honorific ? guest.honorific + " " : ""}
                    {guest.recipientName}
                  </h2>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                    <span>{t("reception.peopleInvited", { count: guest.seats.length })}</span>
                    {"side" in guest && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>
                          {t("planning.sideValues." + guest.side, { defaultValue: guest.side })}
                        </span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <span>
                      {t("reception.checkedInOfPlaces", {
                        checkedIn: guest.seats.filter((seat) => seat.checkedInAt).length,
                        places: guest.seats.length,
                      })}
                    </span>
                  </p>
                </div>
              </div>
              {activeSearchQuery && (
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-11 justify-start self-start px-2 sm:shrink-0"
                  onClick={() => {
                    setGuest(null);
                    setSelectedIds([]);
                    setOutcomes({});
                    setExceptionReason("");
                    setError("");
                    setMessage("");
                    window.setTimeout(() => searchInput.current?.focus(), 0);
                  }}
                >
                  <ArrowLeft aria-hidden="true" />
                  {t("reception.returnToResults")}
                </Button>
              )}
            </div>

            {"published" in guest && !guest.published && (
              <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                {t("reception.seatingNotPublishedCounter")}
              </p>
            )}

            <section aria-labelledby="checkin-people-heading">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 id="checkin-people-heading" className="font-semibold">
                  {t("reception.eachInvitedPerson")}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t("reception.selectedCount", { count: selectedIds.length })}
                </p>
              </div>
              {guest.seats.length === 0 ? (
                <p className="mt-3 rounded-lg border p-4 text-sm text-muted-foreground">
                  {t("reception.noPlacesToCheckIn")}
                </p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {guest.seats.map((seat) => {
                    const outcome = outcomes[seat.placeId];
                    const checkedIn = Boolean(seat.checkedInAt) || outcome !== undefined;
                    const statusText = attendanceLabel(seat, outcome, t);
                    return (
                      <li
                        key={seat.placeId}
                        className={
                          "rounded-xl border p-3 transition-colors sm:p-4 " +
                          (selectedIds.includes(seat.placeId)
                            ? "border-primary/50 bg-primary/5"
                            : "bg-background")
                        }
                      >
                        <label className="flex min-h-11 cursor-pointer items-start gap-3">
                          <input
                            type="checkbox"
                            className="mt-1 size-5 accent-primary"
                            checked={selectedIds.includes(seat.placeId)}
                            onChange={(event) => togglePlace(seat.placeId, event.target.checked)}
                            disabled={checkedIn || checkInPending}
                            aria-label={t("reception.selectPersonForCheckIn", {
                              name: seat.personName ?? t("guestNumber", { number: seat.position }),
                            })}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block font-medium">
                              {seat.personName ?? t("guestNumber", { number: seat.position })}
                            </span>
                            <span className="mt-1 block text-sm text-muted-foreground">
                              {seat.table
                                ? `${t("reception.tableLabel")} ${seat.table}${seat.seatNumber !== null ? ` · ${t("reception.seatNumber", { number: seat.seatNumber })}` : ""}`
                                : t("reception.notAssigned")}
                            </span>
                          </span>
                        </label>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ${checkedIn ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-950"}`}
                          >
                            {checkedIn ? (
                              <CircleCheck className="size-4" aria-hidden="true" />
                            ) : (
                              <CircleDashed className="size-4" aria-hidden="true" />
                            )}
                            {statusText}
                          </span>
                          <span className="inline-flex items-center rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-foreground">
                            {t("reception.attendance." + seat.status)}
                          </span>
                          {seat.checkedInAt && (
                            <span className="text-xs text-muted-foreground">
                              {t("reception.checkedInAt", {
                                time: friendlyTime(seat.checkedInAt, language),
                              })}
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {selectedUnused && (
              <label className="block space-y-1 text-sm">
                <span className="font-medium">
                  {t("reception.exceptionReasonLabel")} <span aria-hidden="true">*</span>
                </span>
                <span className="block text-muted-foreground">
                  {t("reception.exceptionReasonHint")}
                </span>
                <Input
                  value={exceptionReason}
                  onChange={(event) => setExceptionReason(event.target.value)}
                  maxLength={500}
                  placeholder={t("reception.exceptionReasonPlaceholder")}
                  aria-required="true"
                  disabled={checkInPending}
                />
              </label>
            )}

            <div className="hidden flex-col gap-3 border-t pt-4 sm:flex sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">{t("reception.confirmationHint")}</p>
              {renderCheckInConfirmation("h-12 w-full sm:w-auto")}
            </div>
          </article>
          {selectedIds.length > 0 && (
            <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:hidden">
              <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
                <p className="text-sm font-medium">
                  {t("reception.selectedCount", { count: selectedIds.length })}
                </p>
                {renderCheckInConfirmation("h-12 flex-1")}
              </div>
            </div>
          )}
        </>
      )}

      {message && (
        <p
          role="status"
          aria-live="polite"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950"
        >
          {message}
        </p>
      )}
    </section>
  );
}
