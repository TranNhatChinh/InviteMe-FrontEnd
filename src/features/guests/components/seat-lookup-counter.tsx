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
  QrCode,
  Search,
  UserRoundCheck,
  UserPlus,
  X,
} from "lucide-react";
import { ApiError } from "@/core/api/api-error";
import { useRuntime } from "@/core/config/runtime";
import { ConfirmDialog } from "@/shared/feedback/confirm-dialog";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { useLocale } from "@/i18n/language-context";
import styles from "./seat-lookup-counter.module.css";
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

function guestInitials(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((part) => Array.from(part)[0] ?? "")
    .join("")
    .toLocaleUpperCase();
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
        className={styles.resultScreen}
        data-result={allAlreadyCheckedIn ? "already-checked-in" : "recorded"}
      >
        <div className={styles.resultContent}>
          <div className={styles.resultMark} aria-hidden="true">
            {allAlreadyCheckedIn ? <AlertCircle /> : <CircleCheck />}
          </div>
          <div className={styles.resultHeading}>
            <p>
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
              className={styles.resultName}
            >
              {counterDisplay.honorific ? `${counterDisplay.honorific} ` : ""}
              {counterDisplay.recipientName}
            </h1>
            <p className={styles.resultSummary}>
              {newlyCheckedIn > 0
                ? t("reception.resultCounts", {
                    newly: newlyCheckedIn,
                    already: previouslyCheckedIn,
                  })
                : t("reception.resultAlreadyCount", { count: previouslyCheckedIn })}
            </p>
          </div>

          <ul aria-label={t("reception.resultList")} className={styles.resultList}>
            {counterDisplay.places.map((place) => {
              const alreadyCheckedIn = place.result === "ALREADY_CHECKED_IN";
              return (
                <li
                  key={place.placeId}
                  className={styles.resultRow}
                  data-result={alreadyCheckedIn ? "already-checked-in" : "recorded"}
                >
                  <span className={styles.resultRowMark} aria-hidden="true">
                    {alreadyCheckedIn ? <AlertCircle /> : <CircleCheck />}
                  </span>
                  <div className={styles.resultPerson}>
                    <p>{place.personName ?? t("guestNumber", { number: place.position })}</p>
                    <span>
                      {alreadyCheckedIn
                        ? t("reception.status.alreadyCheckedIn")
                        : t("reception.status.justCheckedIn")}
                    </span>
                    <small>{friendlyTime(place.checkedInAt, language)}</small>
                  </div>
                  <div className={styles.resultTable}>
                    <span>{t("reception.tableNumber")}</span>
                    <strong>{place.table ?? t("reception.notAssigned")}</strong>
                    {place.table && place.seatNumber !== null && (
                      <small>{t("reception.seatNumber", { number: place.seatNumber })}</small>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {counterDisplay.overCapacity && (
            <p className={styles.capacityNotice}>{t("reception.overCapacityAccepted")}</p>
          )}

          <div className={styles.resultActions}>
            <Button type="button" onClick={returnToScanner} className={styles.nextGuestButton}>
              {t("reception.nextGuest")}
            </Button>
            <p aria-live="off">{t("reception.returnCountdown", { count: returnCountdown })}</p>
            <div className={styles.returnProgress} aria-hidden="true">
              <span style={{ width: `${(returnCountdown / COUNTER_DISPLAY_SECONDS) * 100}%` }} />
            </div>
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
    const confirmationDescription = t("reception.confirmNamedDescription", {
      names: selectedNames,
      count: selectedIds.length,
    });

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
        description={confirmationDescription}
        contentClassName={styles.confirmationDialog}
        notice={
          selectedUnused ? (
            <p className={styles.confirmationNotice}>{t("reception.exceptionConfirmation")}</p>
          ) : null
        }
        cancelLabel={t("reception.goBack")}
        confirmLabel={t("reception.recordCheckIn")}
        confirmClassName={styles.confirmationAction}
        onConfirm={() => void confirmCheckIn()}
      />
    );
  }

  return (
    <section className={styles.counter}>
      <header className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>{t("reception.title")}</h1>
          <p className={styles.pageDescription}>{t("reception.description")}</p>
        </div>
      </header>

      <div className={styles.workspace}>
        <div role="tablist" aria-label={t("reception.modesLabel")} className={styles.modeTabs}>
          {(
            [
              ["QR", t("reception.scanQr"), QrCode],
              ["SEARCH", t("reception.searchGuest"), Search],
              ["WALK_IN", t("reception.walkIn"), UserPlus],
            ] as const
          ).map(([value, label, Icon], index) => (
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
              className={styles.modeTab}
              data-active={mode === value}
            >
              <Icon aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </div>

        {mode === "QR" && (
          <div
            id="check-in-panel-qr"
            role="tabpanel"
            aria-labelledby="check-in-tab-qr"
            className={styles.qrPanel}
          >
            <QrCameraScanner
              className={styles.scanner}
              disabled={lookupPending || checkInPending}
              autoStart={autoStartCamera}
              onDetected={(value) => {
                setResumeCameraOnReturn(true);
                setCode(value);
                void findGuest(value);
              }}
            />
            <div className={styles.manualLookup}>
              <h2>{t("reception.manualLookupTitle")}</h2>
              <form onSubmit={submitLookup} className={styles.lookupForm}>
                <label htmlFor="checkin-lookup-code">{t("reception.codeLabel")}</label>
                <div className={styles.lookupControls}>
                  <Input
                    id="checkin-lookup-code"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder={t("reception.codePlaceholder")}
                    className={styles.lookupInput}
                    disabled={lookupPending || checkInPending}
                  />
                  <Button
                    type="submit"
                    disabled={!code.trim() || lookupPending || checkInPending}
                    className={styles.lookupButton}
                  >
                    <Search aria-hidden="true" />
                    {lookupPending ? t("reception.lookupPending") : t("reception.lookup")}
                  </Button>
                </div>
              </form>
              <p className={styles.lookupHint}>
                <AlertCircle aria-hidden="true" />
                <span>{t("reception.lookupHint")}</span>
              </p>
            </div>
          </div>
        )}

        {mode === "SEARCH" && (
          <div
            id="check-in-panel-search"
            role="tabpanel"
            aria-labelledby="check-in-tab-search"
            className={styles.searchPanel}
          >
            <form onSubmit={findReceptionGuests} className={styles.searchForm}>
              <label className={styles.searchField} htmlFor="checkin-guest-search">
                <Search aria-hidden="true" />
                <Input
                  id="checkin-guest-search"
                  ref={searchInput}
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  autoComplete="off"
                  aria-label={t("reception.searchLabel")}
                  placeholder={t("reception.searchPlaceholder")}
                  aria-describedby="check-in-search-hint"
                  className="shadow-none"
                  disabled={searchPending || checkInPending}
                />
              </label>
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
                className={styles.clearSearch}
              >
                <X aria-hidden="true" />
              </Button>
              <Button
                type="submit"
                disabled={searchText.trim().length < 2 || searchPending || checkInPending}
                className={styles.searchButton}
              >
                <Search aria-hidden="true" />
                <span className="hidden sm:inline">
                  {searchPending ? t("reception.searching") : t("reception.search")}
                </span>
                <span className="sr-only sm:hidden">{t("reception.search")}</span>
              </Button>
            </form>
            <p id="check-in-search-hint" className={styles.searchHint}>
              {t("reception.searchMinChars")}
            </p>
            {searchResults.length > 0 && !guest && (
              <>
                <p className={styles.resultCount}>
                  {t("reception.searchResults", { count: searchResults.length })}
                </p>
                <ul className={styles.searchResults} aria-label={t("reception.searchResultsLabel")}>
                  {searchResults.map((result) => (
                    <li key={result.guestId} className={styles.searchResult}>
                      <div className={styles.searchGuestIdentity}>
                        <span className={styles.guestInitials} aria-hidden="true">
                          {guestInitials(result.recipientName)}
                        </span>
                        <div className={styles.searchGuestCopy}>
                          <p>
                            {result.honorific ? result.honorific + " " : ""}
                            {result.recipientName}
                          </p>
                          <span>
                            {t("planning.sideValues." + result.side, { defaultValue: result.side })}
                          </span>
                        </div>
                      </div>
                      <div className={styles.searchGuestMeta}>
                        <span>
                          {t("reception.checkedInOfPlaces", {
                            checkedIn: result.checkedIn,
                            places: result.places,
                          })}
                        </span>
                        <span>
                          {result.tables.length
                            ? result.tables.join(", ")
                            : t("reception.notAssigned")}
                        </span>
                      </div>
                      <div className={styles.searchActions}>
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
              <div className={styles.searchEmpty}>
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
            className={styles.walkInPanel}
          >
            <header className={styles.walkInHeader}>
              <div>
                <h2>{t("reception.walkInTitle")}</h2>
                <p>{t("reception.walkInImmediateHint")}</p>
              </div>
            </header>
            {walkInGuestId ? (
              <div className={styles.companionContext}>
                <p>
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
            ) : null}
            <div className={styles.walkInFields}>
              {!walkInGuestId && (
                <label className={styles.walkInNameField}>
                  <span>
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
              )}
              <label className={styles.walkInPartySize}>
                <span>
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
                <span>
                  {walkInGuestId
                    ? t("reception.allCompanionsCheckedIn")
                    : t("reception.totalPeopleHint")}
                </span>
              </label>
            </div>
            <details
              open={showWalkInDetails || Boolean(walkInReason)}
              onToggle={(event) => setShowWalkInDetails(event.currentTarget.open)}
              className={styles.walkInDetails}
            >
              <summary>
                <span>{t("reception.additionalDetails")}</span>
                <ChevronDown aria-hidden="true" />
              </summary>
              <div className={styles.walkInDetailsContent}>
                {!walkInGuestId && (
                  <>
                    <label>
                      <span>{t("reception.honorific")}</span>
                      <Input
                        value={walkInHonorific}
                        onChange={(event) => setWalkInHonorific(event.target.value)}
                        maxLength={50}
                        placeholder={t("reception.honorificPlaceholder")}
                        disabled={walkInPending}
                      />
                    </label>
                    <label>
                      <span>{t("reception.sideGroup")}</span>
                      <select
                        value={walkInSide}
                        onChange={(event) =>
                          setWalkInSide(event.target.value as NonNullable<WalkInInput["side"]>)
                        }
                        disabled={walkInPending}
                      >
                        <option value="UNSPECIFIED">{t("planning.sideValues.UNSPECIFIED")}</option>
                        <option value="BRIDE">{t("planning.sideValues.BRIDE")}</option>
                        <option value="GROOM">{t("planning.sideValues.GROOM")}</option>
                        <option value="MUTUAL">{t("planning.sideValues.MUTUAL")}</option>
                      </select>
                    </label>
                  </>
                )}
                <label className={styles.companionNamesField}>
                  <span>{t("reception.companionNames")}</span>
                  <textarea
                    value={walkInNames}
                    onChange={(event) => setWalkInNames(event.target.value)}
                    rows={2}
                    disabled={walkInPending}
                    placeholder={t("reception.companionNamesPlaceholder")}
                  />
                </label>
                <label className={styles.capacityReasonField}>
                  <span>{t("reception.capacityOverrideReason")}</span>
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
              className={styles.walkInSubmit}
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
        <div role="alert" className={styles.notice} data-type={forbidden ? "warning" : "error"}>
          {error}
          {forbidden && <p className="mt-1">{t("reception.checkInPermissionRequired")}</p>}
        </div>
      )}

      {guest && (
        <>
          <article className={styles.guestCard}>
            <div className={styles.guestSummary}>
              <div className={styles.guestIdentity}>
                <div className={styles.guestPortrait} aria-hidden="true">
                  {guestInitials(guest.recipientName)}
                </div>
                <div className={styles.guestNameBlock}>
                  <p>{t("reception.guestLabel")}</p>
                  <h2 ref={guestHeading} tabIndex={-1} className={styles.guestName}>
                    {guest.honorific ? guest.honorific + " " : ""}
                    {guest.recipientName}
                  </h2>
                  {"side" in guest && (
                    <span className={styles.guestSide}>
                      {t("planning.sideValues." + guest.side, { defaultValue: guest.side })}
                    </span>
                  )}
                </div>
              </div>
              <div className={styles.guestStats}>
                <div>
                  <span>{t("reception.invitedCountLabel")}</span>
                  <strong>{guest.seats.length}</strong>
                </div>
                <div>
                  <span>{t("reception.checkedInCountLabel")}</span>
                  <strong>{guest.seats.filter((seat) => seat.checkedInAt).length}</strong>
                </div>
              </div>
              {activeSearchQuery && (
                <Button
                  type="button"
                  variant="ghost"
                  className={styles.returnToResults}
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
              <p className={styles.seatingNotice}>{t("reception.seatingNotPublishedCounter")}</p>
            )}

            <section className={styles.attendeeSection} aria-labelledby="checkin-people-heading">
              <div className={styles.attendeeHeading}>
                <h3 id="checkin-people-heading">{t("reception.eachInvitedPerson")}</h3>
                <p>{t("reception.selectedCount", { count: selectedIds.length })}</p>
              </div>
              {guest.seats.length === 0 ? (
                <p className={styles.emptyAttendees}>{t("reception.noPlacesToCheckIn")}</p>
              ) : (
                <ul className={styles.attendeeList}>
                  {guest.seats.map((seat) => {
                    const outcome = outcomes[seat.placeId];
                    const checkedIn = Boolean(seat.checkedInAt) || outcome !== undefined;
                    const statusText = attendanceLabel(seat, outcome, t);
                    return (
                      <li
                        key={seat.placeId}
                        className={styles.attendeeRow}
                        data-selected={selectedIds.includes(seat.placeId)}
                        data-check-in-status={
                          outcome === "CHECKED_IN"
                            ? "checked-in"
                            : outcome === "ALREADY_CHECKED_IN" || seat.checkedInAt
                              ? "already-checked-in"
                              : "not-checked-in"
                        }
                        data-rsvp-status={seat.status}
                      >
                        <label className={styles.attendeeSelect}>
                          <input
                            type="checkbox"
                            className={styles.attendeeCheckbox}
                            checked={selectedIds.includes(seat.placeId)}
                            onChange={(event) => togglePlace(seat.placeId, event.target.checked)}
                            disabled={checkedIn || checkInPending}
                            aria-label={t("reception.selectPersonForCheckIn", {
                              name: seat.personName ?? t("guestNumber", { number: seat.position }),
                            })}
                          />
                          <span className={styles.attendeeIdentity}>
                            <span className={styles.attendeeName}>
                              {seat.personName ?? t("guestNumber", { number: seat.position })}
                            </span>
                            <span className={styles.attendeeTable}>
                              {seat.table ? (
                                <>
                                  <span>
                                    {t("reception.tableLabel")} {seat.table}
                                  </span>
                                  {seat.seatNumber !== null && (
                                    <span>
                                      {t("reception.seatNumber", { number: seat.seatNumber })}
                                    </span>
                                  )}
                                </>
                              ) : (
                                t("reception.notAssigned")
                              )}
                            </span>
                          </span>
                          <span className={styles.attendeeRsvp} data-rsvp-status={seat.status}>
                            {t("reception.attendance." + seat.status)}
                          </span>
                          <span className={styles.attendeeCheckIn}>
                            {checkedIn ? (
                              <CircleCheck aria-hidden="true" />
                            ) : (
                              <CircleDashed aria-hidden="true" />
                            )}
                            <span>{statusText}</span>
                            {seat.checkedInAt && (
                              <small>
                                {t("reception.checkedInAt", {
                                  time: friendlyTime(seat.checkedInAt, language),
                                })}
                              </small>
                            )}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {selectedUnused && (
              <label className={styles.exceptionField}>
                <span>
                  {t("reception.exceptionReasonLabel")} <span aria-hidden="true">*</span>
                </span>
                <span>{t("reception.exceptionReasonHint")}</span>
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

            <div className={styles.selectionFooter}>
              <p>{t("reception.confirmationHint")}</p>
              {renderCheckInConfirmation("h-12 w-full sm:w-auto")}
            </div>
          </article>
          {selectedIds.length > 0 && (
            <div className={styles.mobileSelectionFooter}>
              <div>
                <p>{t("reception.selectedCount", { count: selectedIds.length })}</p>
                {renderCheckInConfirmation("h-12 flex-1")}
              </div>
            </div>
          )}
        </>
      )}

      {message && (
        <p role="status" aria-live="polite" className={styles.statusMessage}>
          {message}
        </p>
      )}
    </section>
  );
}
